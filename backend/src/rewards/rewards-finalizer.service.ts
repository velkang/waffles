import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  getAddress,
  http,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { DatabaseService } from '../database/database.service'
import { DrandService } from './drand.service'
import {
  allocateEqualPrizes,
  buildRewardMerkleDistribution,
  drawWeightedWinners,
  type TicketEntry,
} from './raffle-engine'
import { RewardsService } from './rewards.service'

@Injectable()
export class RewardsFinalizerService {
  private readonly logger = new Logger(RewardsFinalizerService.name)

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly rewards: RewardsService,
    private readonly drand: DrandService,
  ) {}

  async finalizeEpoch(epochId: number) {
    const current = this.rewards.getEpochAt()
    if (
      !Number.isSafeInteger(epochId) ||
      epochId < 0 ||
      epochId >= current.epochId
    ) {
      throw new Error('Only completed epochs can be finalized')
    }
    const existing = await this.database
      .getDb()
      .collection('rewardsEpochs')
      .findOne({ epochId })
    if (
      existing &&
      ['drawn', 'submitted', 'finalized'].includes(String(existing.status))
    )
      return existing
    if (existing?.status === 'snapshotting')
      throw new Error(`Epoch ${epochId} is already being finalized`)

    const bounds = this.bounds(epochId)
    const delayMs =
      this.config.get<number>('rewards.finalityDelaySec', 60) * 1000
    if (Date.now() < bounds.endAt.getTime() + delayMs)
      throw new Error('Epoch finality delay has not elapsed')

    const epochs = this.database.getDb().collection('rewardsEpochs')
    try {
      await epochs.insertOne({
        epochId,
        ...bounds,
        totalPoolUsdc: '0',
        status: 'snapshotting',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    } catch (error) {
      if ((error as { code?: number }).code === 11000)
        throw new Error(`Epoch ${epochId} finalization lock exists`)
      throw error
    }

    try {
      const snapshot = await this.buildSnapshot(
        epochId,
        bounds.startAt,
        bounds.endAt,
      )
      if (snapshot.entries.length === 0)
        throw new Error('Epoch has no eligible ticket holders')
      if (snapshot.poolUsdc === 0n)
        throw new Error('Epoch has no attributable reward pool')

      const snapshotJson = JSON.stringify({
        version: 1,
        epochId,
        startAt: bounds.startAt.toISOString(),
        endAt: bounds.endAt.toISOString(),
        cutoffBlock: snapshot.cutoffBlock,
        ticketThresholdUsdc: this.config.get<number>(
          'rewards.ticketThresholdUsdc',
          1000,
        ),
        entries: snapshot.entries.map((entry) => ({
          address: entry.address.toLowerCase(),
          tickets: entry.tickets.toString(),
        })),
      })
      const snapshotHash = keccak256(stringToHex(snapshotJson))
      const beacon = await this.drand.getFirstBeaconAfter(bounds.endAt)
      const chainId = 5_042_002n
      const distributor = getAddress(this.requiredDistributor())
      const seed = keccak256(
        encodeAbiParameters(
          [
            { type: 'uint256' },
            { type: 'address' },
            { type: 'uint256' },
            { type: 'bytes32' },
            { type: 'bytes' },
          ],
          [
            chainId,
            distributor,
            BigInt(epochId),
            snapshotHash,
            beacon.signature,
          ],
        ),
      )
      const winnerCount = this.config.get<number>('rewards.winnerCount', 20)
      const winners = drawWeightedWinners(snapshot.entries, winnerCount, seed)
      const prizes = allocateEqualPrizes(winners, snapshot.poolUsdc)
      const distribution = buildRewardMerkleDistribution(
        chainId,
        distributor,
        BigInt(epochId),
        prizes,
      )

      const volumeCollection = this.database
        .getDb()
        .collection('epochTraderVolumes')
      const winnerCollection = this.database.getDb().collection('epochWinners')
      await volumeCollection.insertMany(
        snapshot.entries.map((entry) => ({
          epochId,
          trader: entry.address.toLowerCase(),
          volumeUsdc: snapshot.volumes
            .get(entry.address.toLowerCase())!
            .volume.toString(),
          tickets: entry.tickets.toString(),
          lastTradeAt: snapshot.volumes.get(entry.address.toLowerCase())!
            .lastTradeAt,
        })),
        { ordered: false },
      )
      await winnerCollection.insertMany(
        distribution.claims.map((claim, drawIndex) => ({
          epochId,
          trader: claim.address.toLowerCase(),
          prizeUsdc: claim.amount.toString(),
          drawIndex,
          merkleLeaf: claim.leaf,
          merkleProof: claim.proof,
          claimed: false,
        })),
      )

      const finalized = {
        epochId,
        ...bounds,
        cutoffBlock: snapshot.cutoffBlock,
        totalPoolUsdc: snapshot.poolUsdc.toString(),
        snapshotHash,
        snapshotVersion: 1,
        drandChainHash: beacon.chainHash,
        drandRound: beacon.round,
        drandSignature: beacon.signature,
        drandRandomness: beacon.randomness,
        seed,
        merkleRoot: distribution.root,
        status: 'drawn',
        updatedAt: new Date(),
      }
      await epochs.updateOne(
        { epochId, status: 'snapshotting' },
        { $set: finalized },
      )
      return finalized
    } catch (error) {
      this.logger.error(
        `Epoch ${epochId} finalization failed`,
        error instanceof Error ? error.stack : error,
      )
      await epochs.updateOne(
        { epochId, status: 'snapshotting' },
        {
          $set: {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            updatedAt: new Date(),
          },
        },
      )
      throw error
    }
  }

  async submitEpoch(epochId: number) {
    const epochs = this.database.getDb().collection('rewardsEpochs')
    const epoch = await epochs.findOne({ epochId })
    if (!epoch || !['drawn', 'submitted'].includes(String(epoch.status))) {
      throw new Error(`Epoch ${epochId} has no completed draw to submit`)
    }
    if (epoch.status === 'submitted' && epoch.transactionHash) return epoch

    const rpcUrl = this.config.get<string>('rewards.rpcUrl', '')
    const privateKey = this.config.get<string>(
      'rewards.finalizerPrivateKey',
      '',
    ) as Hex
    if (!rpcUrl || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      throw new Error(
        'REWARDS_RPC_URL and REWARDS_FINALIZER_PRIVATE_KEY are required for submission',
      )
    }
    const chain = defineChain({
      id: 5_042_002,
      name: 'Arc Testnet',
      nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    })
    const account = privateKeyToAccount(privateKey)
    const transport = http(rpcUrl)
    const wallet = createWalletClient({ account, chain, transport })
    const publicClient = createPublicClient({ chain, transport })
    const address = getAddress(this.requiredDistributor())
    const abi = [
      {
        type: 'function',
        name: 'setEpochRoot',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'epochId', type: 'uint256' },
          { name: 'merkleRoot', type: 'bytes32' },
          { name: 'totalAmount', type: 'uint256' },
          { name: 'snapshotHash', type: 'bytes32' },
          { name: 'drandRound', type: 'uint256' },
          { name: 'drandSignature', type: 'bytes' },
        ],
        outputs: [],
      },
    ] as const
    const args = [
      BigInt(epochId),
      epoch.merkleRoot as Hex,
      BigInt(String(epoch.totalPoolUsdc)),
      epoch.snapshotHash as Hex,
      BigInt(Number(epoch.drandRound)),
      epoch.drandSignature as Hex,
    ] as const
    const { request } = await publicClient.simulateContract({
      address,
      abi,
      functionName: 'setEpochRoot',
      args,
      account,
    })
    const transactionHash = await wallet.writeContract(request)
    await epochs.updateOne(
      { epochId, status: 'drawn' },
      { $set: { status: 'submitted', transactionHash, updatedAt: new Date() } },
    )
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: transactionHash,
    })
    if (receipt.status !== 'success')
      throw new Error(
        `Epoch finalization transaction reverted: ${transactionHash}`,
      )
    await epochs.updateOne(
      { epochId, transactionHash },
      {
        $set: {
          status: 'finalized',
          finalizedBlock: Number(receipt.blockNumber),
          updatedAt: new Date(),
        },
      },
    )
    return epochs.findOne({ epochId })
  }

  private bounds(epochId: number) {
    let zero = Number(
      this.config.get<number>('rewards.epochZeroUnixSec', 1756684800),
    )
    if (zero > 1e11) zero = Math.floor(zero / 1000)
    const duration = Math.max(
      60,
      this.config.get<number>('rewards.epochDurationSec', 604800),
    )
    return {
      startAt: new Date((zero + epochId * duration) * 1000),
      endAt: new Date((zero + (epochId + 1) * duration) * 1000),
    }
  }

  private async buildSnapshot(epochId: number, startAt: Date, endAt: Date) {
    const threshold =
      BigInt(this.config.get<number>('rewards.ticketThresholdUsdc', 1000)) *
      1_000_000n
    const volumes = new Map<string, { volume: bigint; lastTradeAt: Date }>()
    let poolUsdc = 0n
    let cutoffBlock = 0
    const cursor = this.database
      .getDb()
      .collection('trades')
      .find({ timestamp: { $gte: startAt, $lt: endAt } })
    for await (const trade of cursor) {
      if (typeof trade.trader !== 'string') continue
      const amount = this.units(trade.usdcGrossAmount ?? trade.usdcAmount)
      const fee = this.units(trade.feeAmount)
      const trader = trade.trader.toLowerCase()
      const timestamp =
        trade.timestamp instanceof Date
          ? trade.timestamp
          : new Date(trade.timestamp)
      const previous = volumes.get(trader)
      volumes.set(trader, {
        volume: (previous?.volume ?? 0n) + amount,
        lastTradeAt:
          !previous || timestamp > previous.lastTradeAt
            ? timestamp
            : previous.lastTradeAt,
      })
      poolUsdc += fee - (fee * 7_000n) / 10_000n - (fee * 2_500n) / 10_000n
      cutoffBlock = Math.max(cutoffBlock, Number(trade.blockNumber ?? 0))
    }
    const entries: TicketEntry[] = [...volumes.entries()]
      .map(([address, value]) => ({
        address: getAddress(address) as Address,
        tickets: value.volume / threshold,
      }))
      .filter((entry) => entry.tickets > 0n)
    return { epochId, entries, volumes, poolUsdc, cutoffBlock }
  }

  private requiredDistributor() {
    const address = this.config.get<string>('rewards.distributorAddress', '')
    if (!/^0x[0-9a-fA-F]{40}$/.test(address))
      throw new Error('REWARDS_DISTRIBUTOR_ADDRESS is required')
    return address as Address
  }

  private units(value: unknown) {
    return typeof value === 'string' && /^\d+$/.test(value) ? BigInt(value) : 0n
  }
}
