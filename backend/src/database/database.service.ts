import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MongoClient, Db } from 'mongodb'

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name)
  private client: MongoClient | null = null
  private db: Db | null = null
  private connectPromise: Promise<Db> | null = null

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.connect()
  }

  async onApplicationShutdown(signal?: string) {
    this.logger.log(`Closing MongoDB connection due to signal: ${signal}`)
    if (this.client) {
      await this.client.close()
      this.client = null
      this.db = null
    }
  }

  async connect(): Promise<Db> {
    if (this.db) {
      return this.db
    }
    if (this.connectPromise) {
      return this.connectPromise
    }

    this.connectPromise = this.connectInternal().finally(() => {
      this.connectPromise = null
    })
    return this.connectPromise
  }

  private async connectInternal(): Promise<Db> {
    const uri = this.configService.get<string>(
      'mongoUri',
      'mongodb://127.0.0.1:27017',
    )
    const dbName = this.configService.get<string>('mongoDb', 'waffles')
    const client = new MongoClient(uri, {
      maxPoolSize: 50,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 50000,
    })

    try {
      this.logger.log(
        `Connecting to MongoDB at ${uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')} (db: ${dbName})`,
      )
      await client.connect()
      this.client = client
      this.db = client.db(dbName)
      this.logger.log('Connected to MongoDB successfully')

      // Ensure indexes
      await this.ensureIndexes()

      return this.db
    } catch (err) {
      await client.close().catch(() => undefined)
      if (this.client === client) this.client = null
      this.db = null
      this.logger.error(
        'Failed to connect to MongoDB',
        err instanceof Error ? err.stack : err,
      )
      throw err
    }
  }

  getDb(): Db {
    if (!this.db) {
      throw new Error('Database is not connected. Call connect() first.')
    }
    return this.db
  }

  getClient(): MongoClient {
    if (!this.client) {
      throw new Error('MongoClient is not connected.')
    }
    return this.client
  }

  async isHealthy(): Promise<boolean> {
    if (!this.client || !this.db) return false
    try {
      await this.db.command({ ping: 1 })
      return true
    } catch {
      return false
    }
  }

  private async ensureIndexes(): Promise<void> {
    if (!this.db) return
    try {
      const launches = this.db.collection('launches')
      await launches.createIndex({ token: 1 }, { unique: true })
      await launches.createIndex({ curve: 1 }, { unique: true })
      await launches.createIndex({ factory: 1, createdAt: -1 })
      await launches.createIndex({ createdAt: -1 })

      const trades = this.db.collection('trades')
      await trades.createIndex(
        { curveAddress: 1, blockNumber: 1, logIndex: 1 },
        { unique: true },
      )
      await trades.createIndex({ eventId: 1 }, { unique: true, sparse: true })
      await trades.createIndex({
        curveAddress: 1,
        blockNumber: -1,
        logIndex: -1,
      })
      await trades.createIndex({ curveAddress: 1, timestamp: -1 })
      await trades.createIndex({ trader: 1, curveAddress: 1 })
      await trades.createIndex({ timestamp: -1 })

      const rewardsEpochs = this.db.collection('rewardsEpochs')
      await rewardsEpochs.createIndex({ epochId: 1 }, { unique: true })
      await rewardsEpochs.createIndex({ status: 1, endAt: 1 })

      const epochTraderVolumes = this.db.collection('epochTraderVolumes')
      await epochTraderVolumes.createIndex(
        { epochId: 1, trader: 1 },
        { unique: true },
      )
      await epochTraderVolumes.createIndex({ epochId: 1, tickets: -1 })

      const epochWinners = this.db.collection('epochWinners')
      await epochWinners.createIndex(
        { epochId: 1, trader: 1 },
        { unique: true },
      )
      await epochWinners.createIndex({ trader: 1, claimed: 1 })

      const control = this.db.collection('realtimeEvents')
      await control.createIndex({ occurredAt: -1 })
      await control.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })

      this.logger.log('Database indexes verified')
    } catch (err) {
      this.logger.warn(
        'Index verification warning:',
        err instanceof Error ? err.message : err,
      )
    }
  }
}
