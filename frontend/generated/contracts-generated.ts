import {
  createUseReadContract,
  createUseWriteContract,
  createUseSimulateContract,
  createUseWatchContractEvent,
} from 'wagmi/codegen'

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// MockUSDC
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const mockUsdcAbi = [
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function',
    inputs: [
      { name: 'owner', internalType: 'address', type: 'address' },
      { name: 'spender', internalType: 'address', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'spender', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', internalType: 'uint8', type: 'uint8' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'name',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'owner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'spender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Approval',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'from', internalType: 'address', type: 'address', indexed: true },
      { name: 'to', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Transfer',
  },
  {
    type: 'error',
    inputs: [
      { name: 'spender', internalType: 'address', type: 'address' },
      { name: 'allowance', internalType: 'uint256', type: 'uint256' },
      { name: 'needed', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ERC20InsufficientAllowance',
  },
  {
    type: 'error',
    inputs: [
      { name: 'sender', internalType: 'address', type: 'address' },
      { name: 'balance', internalType: 'uint256', type: 'uint256' },
      { name: 'needed', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ERC20InsufficientBalance',
  },
  {
    type: 'error',
    inputs: [{ name: 'approver', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidApprover',
  },
  {
    type: 'error',
    inputs: [{ name: 'receiver', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidReceiver',
  },
  {
    type: 'error',
    inputs: [{ name: 'sender', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidSender',
  },
  {
    type: 'error',
    inputs: [{ name: 'spender', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidSpender',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// WafflesAmmFactory
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const wafflesAmmFactoryAbi = [
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    name: 'allPairs',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'allPairsLength',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'tokenA', internalType: 'address', type: 'address' },
      { name: 'tokenB', internalType: 'address', type: 'address' },
    ],
    name: 'createPair',
    outputs: [{ name: 'pair', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'address', type: 'address' },
    ],
    name: 'getPair',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'pairCreator',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'parameters',
    outputs: [
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'pairCreator_', internalType: 'address', type: 'address' },
    ],
    name: 'setPairCreator',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'token0',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'token1',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'pair',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'pairCount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'PairCreated',
  },
  { type: 'error', inputs: [], name: 'AlreadyConfigured' },
  { type: 'error', inputs: [], name: 'IdenticalAddresses' },
  { type: 'error', inputs: [], name: 'PairExists' },
  { type: 'error', inputs: [], name: 'Unauthorized' },
  { type: 'error', inputs: [], name: 'ZeroAddress' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// WafflesAmmMigrator
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const wafflesAmmMigratorAbi = [
  {
    type: 'constructor',
    inputs: [
      {
        name: 'factory_',
        internalType: 'contract WafflesAmmFactory',
        type: 'address',
      },
      { name: 'usdc_', internalType: 'contract IERC20', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'DEAD_ADDRESS',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'factory',
    outputs: [
      { name: '', internalType: 'contract WafflesAmmFactory', type: 'address' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'launchFactory',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'tokenAmount', internalType: 'uint256', type: 'uint256' },
      { name: 'usdcAmount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'migrate',
    outputs: [{ name: 'pool', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'launchFactory_', internalType: 'address', type: 'address' },
    ],
    name: 'setLaunchFactory',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'usdc',
    outputs: [{ name: '', internalType: 'contract IERC20', type: 'address' }],
    stateMutability: 'view',
  },
  { type: 'error', inputs: [], name: 'AlreadyConfigured' },
  { type: 'error', inputs: [], name: 'InvalidAddress' },
  { type: 'error', inputs: [], name: 'InvalidAmounts' },
  { type: 'error', inputs: [], name: 'PairAlreadyExists' },
  {
    type: 'error',
    inputs: [{ name: 'token', internalType: 'address', type: 'address' }],
    name: 'SafeERC20FailedOperation',
  },
  { type: 'error', inputs: [], name: 'Unauthorized' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// WafflesAmmPair
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const wafflesAmmPairAbi = [
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function',
    inputs: [],
    name: 'BPS_DENOM',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'FEE_BPS',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'MINIMUM_LIQUIDITY',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'owner', internalType: 'address', type: 'address' },
      { name: 'spender', internalType: 'address', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'spender', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'to', internalType: 'address', type: 'address' }],
    name: 'burn',
    outputs: [
      { name: 'amount0', internalType: 'uint256', type: 'uint256' },
      { name: 'amount1', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', internalType: 'uint8', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'factory',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getReserves',
    outputs: [
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'to', internalType: 'address', type: 'address' }],
    name: 'mint',
    outputs: [{ name: 'liquidity', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'name',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'to', internalType: 'address', type: 'address' }],
    name: 'skim',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'amount0Out', internalType: 'uint256', type: 'uint256' },
      { name: 'amount1Out', internalType: 'uint256', type: 'uint256' },
      { name: 'to', internalType: 'address', type: 'address' },
    ],
    name: 'swap',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'sync',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'token0',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'token1',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'owner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'spender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Approval',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      { name: 'to', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'amount0',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'amount1',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Burn',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount0',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'amount1',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Mint',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      { name: 'to', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'amount0In',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'amount1In',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'amount0Out',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'amount1Out',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Swap',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'reserve0',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'reserve1',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Sync',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'from', internalType: 'address', type: 'address', indexed: true },
      { name: 'to', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Transfer',
  },
  {
    type: 'error',
    inputs: [
      { name: 'spender', internalType: 'address', type: 'address' },
      { name: 'allowance', internalType: 'uint256', type: 'uint256' },
      { name: 'needed', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ERC20InsufficientAllowance',
  },
  {
    type: 'error',
    inputs: [
      { name: 'sender', internalType: 'address', type: 'address' },
      { name: 'balance', internalType: 'uint256', type: 'uint256' },
      { name: 'needed', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ERC20InsufficientBalance',
  },
  {
    type: 'error',
    inputs: [{ name: 'approver', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidApprover',
  },
  {
    type: 'error',
    inputs: [{ name: 'receiver', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidReceiver',
  },
  {
    type: 'error',
    inputs: [{ name: 'sender', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidSender',
  },
  {
    type: 'error',
    inputs: [{ name: 'spender', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidSpender',
  },
  { type: 'error', inputs: [], name: 'InsufficientInputAmount' },
  { type: 'error', inputs: [], name: 'InsufficientLiquidity' },
  { type: 'error', inputs: [], name: 'InsufficientLiquidityBurned' },
  { type: 'error', inputs: [], name: 'InsufficientLiquidityMinted' },
  { type: 'error', inputs: [], name: 'InsufficientOutputAmount' },
  { type: 'error', inputs: [], name: 'InvalidTo' },
  { type: 'error', inputs: [], name: 'K' },
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
  {
    type: 'error',
    inputs: [{ name: 'token', internalType: 'address', type: 'address' }],
    name: 'SafeERC20FailedOperation',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// WafflesAmmRouter
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const wafflesAmmRouterAbi = [
  {
    type: 'constructor',
    inputs: [
      {
        name: 'factory_',
        internalType: 'contract WafflesAmmFactory',
        type: 'address',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'BPS_DENOM',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'FEE_NUM',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'factory',
    outputs: [
      { name: '', internalType: 'contract WafflesAmmFactory', type: 'address' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'pair', internalType: 'address', type: 'address' },
      { name: 'tokenIn', internalType: 'address', type: 'address' },
      { name: 'amountIn', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'quoteExactInput',
    outputs: [{ name: 'amountOut', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'pair', internalType: 'address', type: 'address' },
      { name: 'tokenIn', internalType: 'address', type: 'address' },
      { name: 'amountIn', internalType: 'uint256', type: 'uint256' },
      { name: 'minAmountOut', internalType: 'uint256', type: 'uint256' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'swapExactTokensForTokens',
    outputs: [{ name: 'amountOut', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      { name: 'pair', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'tokenIn',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amountIn',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'amountOut',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      { name: 'to', internalType: 'address', type: 'address', indexed: false },
    ],
    name: 'SwapExactIn',
  },
  { type: 'error', inputs: [], name: 'Expired' },
  { type: 'error', inputs: [], name: 'InvalidAddress' },
  { type: 'error', inputs: [], name: 'InvalidPair' },
  { type: 'error', inputs: [], name: 'InvalidToken' },
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
  {
    type: 'error',
    inputs: [{ name: 'token', internalType: 'address', type: 'address' }],
    name: 'SafeERC20FailedOperation',
  },
  { type: 'error', inputs: [], name: 'Slippage' },
  { type: 'error', inputs: [], name: 'ZeroInput' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// WafflesBondingCurve
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const wafflesBondingCurveAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'token_', internalType: 'address', type: 'address' },
      { name: 'usdc_', internalType: 'address', type: 'address' },
      { name: 'creator_', internalType: 'address', type: 'address' },
      { name: 'treasury_', internalType: 'address', type: 'address' },
      { name: 'migrator_', internalType: 'address', type: 'address' },
      {
        name: 'initialVirtualUsdcReserve_',
        internalType: 'uint256',
        type: 'uint256',
      },
      {
        name: 'initialVirtualTokenReserve_',
        internalType: 'uint256',
        type: 'uint256',
      },
      {
        name: 'minVirtualTokenReserve_',
        internalType: 'uint256',
        type: 'uint256',
      },
      { name: 'feeBps_', internalType: 'uint256', type: 'uint256' },
      { name: 'protocolFeeBps_', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'BPS_DENOM',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'PRICE_SCALE',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'usdcIn', internalType: 'uint256', type: 'uint256' },
      { name: 'minTokensOut', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'buy',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'canGraduate',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'claimCreatorFees',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'creator',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'creatorEarnings',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'currentPrice',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'feeBps',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'graduate',
    outputs: [{ name: 'pool', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'graduated',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'graduationMarketCap',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'graduationMarketCapTarget',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'graduationPool',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'graduationPrice',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'graduationProgressBps',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'initialVirtualTokenReserve',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'initialVirtualUsdcReserve',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'k',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'liquidityTokenReserve',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'marketCap',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'migrator',
    outputs: [
      {
        name: '',
        internalType: 'contract ILiquidityMigrator',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'minVirtualTokenReserve',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'protocolFeeBps',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'usdcIn', internalType: 'uint256', type: 'uint256' }],
    name: 'quoteBuy',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'tokensIn', internalType: 'uint256', type: 'uint256' }],
    name: 'quoteSell',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'reserveUsdc',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'tokensIn', internalType: 'uint256', type: 'uint256' },
      { name: 'minUsdcOut', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'sell',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'sellableTokens',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'targetVirtualUsdcReserve',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'token',
    outputs: [{ name: '', internalType: 'contract IERC20', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'totalSupply_',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'treasury',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'usdc',
    outputs: [{ name: '', internalType: 'contract IERC20', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'virtualTokenReserve',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'virtualUsdcReserve',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'creator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'CreatorFeesClaimed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'pool', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'graduationPrice',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'graduationMarketCap',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Graduated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'trader',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      { name: 'isBuy', internalType: 'bool', type: 'bool', indexed: true },
      {
        name: 'usdcAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'tokenAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'priceAfter',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'mcapAfter',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'progressBpsAfter',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Traded',
  },
  { type: 'error', inputs: [], name: 'CurveClosed' },
  { type: 'error', inputs: [], name: 'ExcessiveSell' },
  { type: 'error', inputs: [], name: 'InsufficientReserve' },
  { type: 'error', inputs: [], name: 'InvalidParameters' },
  { type: 'error', inputs: [], name: 'NotCreator' },
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
  {
    type: 'error',
    inputs: [{ name: 'token', internalType: 'address', type: 'address' }],
    name: 'SafeERC20FailedOperation',
  },
  { type: 'error', inputs: [], name: 'Slippage' },
  { type: 'error', inputs: [], name: 'ThresholdNotReached' },
  { type: 'error', inputs: [], name: 'ZeroOutput' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// WafflesLaunchFactory
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const wafflesLaunchFactoryAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'usdc_', internalType: 'address', type: 'address' },
      { name: 'treasury_', internalType: 'address', type: 'address' },
      { name: 'migrator_', internalType: 'address', type: 'address' },
      { name: 'creationFee_', internalType: 'uint256', type: 'uint256' },
      {
        name: 'initialVirtualUsdcReserve_',
        internalType: 'uint256',
        type: 'uint256',
      },
      {
        name: 'initialVirtualTokenReserve_',
        internalType: 'uint256',
        type: 'uint256',
      },
      {
        name: 'minVirtualTokenReserve_',
        internalType: 'uint256',
        type: 'uint256',
      },
      { name: 'feeBps_', internalType: 'uint256', type: 'uint256' },
      { name: 'protocolFeeBps_', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'TOKEN_SUPPLY',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'acceptOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    name: 'allTokens',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'allTokensLength',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'name', internalType: 'string', type: 'string' },
      { name: 'symbol', internalType: 'string', type: 'string' },
      { name: 'description', internalType: 'string', type: 'string' },
      { name: 'imageUri', internalType: 'string', type: 'string' },
      { name: 'website', internalType: 'string', type: 'string' },
      { name: 'twitter', internalType: 'string', type: 'string' },
      { name: 'telegram', internalType: 'string', type: 'string' },
    ],
    name: 'createToken',
    outputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'curve', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'creationFee',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'feeBps',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'initialVirtualTokenReserve',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'initialVirtualUsdcReserve',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'launchOfToken',
    outputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'curve', internalType: 'address', type: 'address' },
      { name: 'creator', internalType: 'address', type: 'address' },
      { name: 'description', internalType: 'string', type: 'string' },
      { name: 'imageUri', internalType: 'string', type: 'string' },
      { name: 'website', internalType: 'string', type: 'string' },
      { name: 'twitter', internalType: 'string', type: 'string' },
      { name: 'telegram', internalType: 'string', type: 'string' },
      { name: 'createdAt', internalType: 'uint64', type: 'uint64' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'migrator',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'minVirtualTokenReserve',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'pendingOwner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'protocolFeeBps',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'fee', internalType: 'uint256', type: 'uint256' }],
    name: 'setCreationFee',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'tokenOfCurve',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'treasury',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'usdc',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousFee',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'newFee',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'CreationFeeUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'pendingOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferStarted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferred',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'curve',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'creator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      { name: 'name', internalType: 'string', type: 'string', indexed: false },
      {
        name: 'symbol',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
      {
        name: 'description',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
      {
        name: 'imageUri',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
      {
        name: 'website',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
      {
        name: 'twitter',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
      {
        name: 'telegram',
        internalType: 'string',
        type: 'string',
        indexed: false,
      },
      {
        name: 'feeBps',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'creationFeePaid',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'TokenCreated',
  },
  { type: 'error', inputs: [], name: 'InvalidAddress' },
  { type: 'error', inputs: [], name: 'InvalidParameters' },
  {
    type: 'error',
    inputs: [{ name: 'token', internalType: 'address', type: 'address' }],
    name: 'SafeERC20FailedOperation',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// WafflesMemeToken
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const wafflesMemeTokenAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'name_', internalType: 'string', type: 'string' },
      { name: 'symbol_', internalType: 'string', type: 'string' },
      { name: 'supply', internalType: 'uint256', type: 'uint256' },
      { name: 'initialHolder', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'owner', internalType: 'address', type: 'address' },
      { name: 'spender', internalType: 'address', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'spender', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', internalType: 'uint8', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'name',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'owner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'spender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Approval',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'from', internalType: 'address', type: 'address', indexed: true },
      { name: 'to', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Transfer',
  },
  {
    type: 'error',
    inputs: [
      { name: 'spender', internalType: 'address', type: 'address' },
      { name: 'allowance', internalType: 'uint256', type: 'uint256' },
      { name: 'needed', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ERC20InsufficientAllowance',
  },
  {
    type: 'error',
    inputs: [
      { name: 'sender', internalType: 'address', type: 'address' },
      { name: 'balance', internalType: 'uint256', type: 'uint256' },
      { name: 'needed', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ERC20InsufficientBalance',
  },
  {
    type: 'error',
    inputs: [{ name: 'approver', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidApprover',
  },
  {
    type: 'error',
    inputs: [{ name: 'receiver', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidReceiver',
  },
  {
    type: 'error',
    inputs: [{ name: 'sender', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidSender',
  },
  {
    type: 'error',
    inputs: [{ name: 'spender', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidSpender',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// React
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link mockUsdcAbi}__
 */
export const useReadMockUsdc = /*#__PURE__*/ createUseReadContract({
  abi: mockUsdcAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link mockUsdcAbi}__ and `functionName` set to `"allowance"`
 */
export const useReadMockUsdcAllowance = /*#__PURE__*/ createUseReadContract({
  abi: mockUsdcAbi,
  functionName: 'allowance',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link mockUsdcAbi}__ and `functionName` set to `"balanceOf"`
 */
export const useReadMockUsdcBalanceOf = /*#__PURE__*/ createUseReadContract({
  abi: mockUsdcAbi,
  functionName: 'balanceOf',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link mockUsdcAbi}__ and `functionName` set to `"decimals"`
 */
export const useReadMockUsdcDecimals = /*#__PURE__*/ createUseReadContract({
  abi: mockUsdcAbi,
  functionName: 'decimals',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link mockUsdcAbi}__ and `functionName` set to `"name"`
 */
export const useReadMockUsdcName = /*#__PURE__*/ createUseReadContract({
  abi: mockUsdcAbi,
  functionName: 'name',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link mockUsdcAbi}__ and `functionName` set to `"symbol"`
 */
export const useReadMockUsdcSymbol = /*#__PURE__*/ createUseReadContract({
  abi: mockUsdcAbi,
  functionName: 'symbol',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link mockUsdcAbi}__ and `functionName` set to `"totalSupply"`
 */
export const useReadMockUsdcTotalSupply = /*#__PURE__*/ createUseReadContract({
  abi: mockUsdcAbi,
  functionName: 'totalSupply',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link mockUsdcAbi}__
 */
export const useWriteMockUsdc = /*#__PURE__*/ createUseWriteContract({
  abi: mockUsdcAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link mockUsdcAbi}__ and `functionName` set to `"approve"`
 */
export const useWriteMockUsdcApprove = /*#__PURE__*/ createUseWriteContract({
  abi: mockUsdcAbi,
  functionName: 'approve',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link mockUsdcAbi}__ and `functionName` set to `"mint"`
 */
export const useWriteMockUsdcMint = /*#__PURE__*/ createUseWriteContract({
  abi: mockUsdcAbi,
  functionName: 'mint',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link mockUsdcAbi}__ and `functionName` set to `"transfer"`
 */
export const useWriteMockUsdcTransfer = /*#__PURE__*/ createUseWriteContract({
  abi: mockUsdcAbi,
  functionName: 'transfer',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link mockUsdcAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useWriteMockUsdcTransferFrom =
  /*#__PURE__*/ createUseWriteContract({
    abi: mockUsdcAbi,
    functionName: 'transferFrom',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link mockUsdcAbi}__
 */
export const useSimulateMockUsdc = /*#__PURE__*/ createUseSimulateContract({
  abi: mockUsdcAbi,
})

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link mockUsdcAbi}__ and `functionName` set to `"approve"`
 */
export const useSimulateMockUsdcApprove =
  /*#__PURE__*/ createUseSimulateContract({
    abi: mockUsdcAbi,
    functionName: 'approve',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link mockUsdcAbi}__ and `functionName` set to `"mint"`
 */
export const useSimulateMockUsdcMint = /*#__PURE__*/ createUseSimulateContract({
  abi: mockUsdcAbi,
  functionName: 'mint',
})

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link mockUsdcAbi}__ and `functionName` set to `"transfer"`
 */
export const useSimulateMockUsdcTransfer =
  /*#__PURE__*/ createUseSimulateContract({
    abi: mockUsdcAbi,
    functionName: 'transfer',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link mockUsdcAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useSimulateMockUsdcTransferFrom =
  /*#__PURE__*/ createUseSimulateContract({
    abi: mockUsdcAbi,
    functionName: 'transferFrom',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link mockUsdcAbi}__
 */
export const useWatchMockUsdcEvent = /*#__PURE__*/ createUseWatchContractEvent({
  abi: mockUsdcAbi,
})

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link mockUsdcAbi}__ and `eventName` set to `"Approval"`
 */
export const useWatchMockUsdcApprovalEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: mockUsdcAbi,
    eventName: 'Approval',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link mockUsdcAbi}__ and `eventName` set to `"Transfer"`
 */
export const useWatchMockUsdcTransferEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: mockUsdcAbi,
    eventName: 'Transfer',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmFactoryAbi}__
 */
export const useReadWafflesAmmFactory = /*#__PURE__*/ createUseReadContract({
  abi: wafflesAmmFactoryAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmFactoryAbi}__ and `functionName` set to `"allPairs"`
 */
export const useReadWafflesAmmFactoryAllPairs =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesAmmFactoryAbi,
    functionName: 'allPairs',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmFactoryAbi}__ and `functionName` set to `"allPairsLength"`
 */
export const useReadWafflesAmmFactoryAllPairsLength =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesAmmFactoryAbi,
    functionName: 'allPairsLength',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmFactoryAbi}__ and `functionName` set to `"getPair"`
 */
export const useReadWafflesAmmFactoryGetPair =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesAmmFactoryAbi,
    functionName: 'getPair',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmFactoryAbi}__ and `functionName` set to `"owner"`
 */
export const useReadWafflesAmmFactoryOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesAmmFactoryAbi,
    functionName: 'owner',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmFactoryAbi}__ and `functionName` set to `"pairCreator"`
 */
export const useReadWafflesAmmFactoryPairCreator =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesAmmFactoryAbi,
    functionName: 'pairCreator',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmFactoryAbi}__ and `functionName` set to `"parameters"`
 */
export const useReadWafflesAmmFactoryParameters =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesAmmFactoryAbi,
    functionName: 'parameters',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesAmmFactoryAbi}__
 */
export const useWriteWafflesAmmFactory = /*#__PURE__*/ createUseWriteContract({
  abi: wafflesAmmFactoryAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesAmmFactoryAbi}__ and `functionName` set to `"createPair"`
 */
export const useWriteWafflesAmmFactoryCreatePair =
  /*#__PURE__*/ createUseWriteContract({
    abi: wafflesAmmFactoryAbi,
    functionName: 'createPair',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesAmmFactoryAbi}__ and `functionName` set to `"setPairCreator"`
 */
export const useWriteWafflesAmmFactorySetPairCreator =
  /*#__PURE__*/ createUseWriteContract({
    abi: wafflesAmmFactoryAbi,
    functionName: 'setPairCreator',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesAmmFactoryAbi}__
 */
export const useSimulateWafflesAmmFactory =
  /*#__PURE__*/ createUseSimulateContract({ abi: wafflesAmmFactoryAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesAmmFactoryAbi}__ and `functionName` set to `"createPair"`
 */
export const useSimulateWafflesAmmFactoryCreatePair =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesAmmFactoryAbi,
    functionName: 'createPair',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesAmmFactoryAbi}__ and `functionName` set to `"setPairCreator"`
 */
export const useSimulateWafflesAmmFactorySetPairCreator =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesAmmFactoryAbi,
    functionName: 'setPairCreator',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesAmmFactoryAbi}__
 */
export const useWatchWafflesAmmFactoryEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: wafflesAmmFactoryAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesAmmFactoryAbi}__ and `eventName` set to `"PairCreated"`
 */
export const useWatchWafflesAmmFactoryPairCreatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: wafflesAmmFactoryAbi,
    eventName: 'PairCreated',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmMigratorAbi}__
 */
export const useReadWafflesAmmMigrator = /*#__PURE__*/ createUseReadContract({
  abi: wafflesAmmMigratorAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmMigratorAbi}__ and `functionName` set to `"DEAD_ADDRESS"`
 */
export const useReadWafflesAmmMigratorDeadAddress =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesAmmMigratorAbi,
    functionName: 'DEAD_ADDRESS',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmMigratorAbi}__ and `functionName` set to `"factory"`
 */
export const useReadWafflesAmmMigratorFactory =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesAmmMigratorAbi,
    functionName: 'factory',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmMigratorAbi}__ and `functionName` set to `"launchFactory"`
 */
export const useReadWafflesAmmMigratorLaunchFactory =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesAmmMigratorAbi,
    functionName: 'launchFactory',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmMigratorAbi}__ and `functionName` set to `"owner"`
 */
export const useReadWafflesAmmMigratorOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesAmmMigratorAbi,
    functionName: 'owner',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmMigratorAbi}__ and `functionName` set to `"usdc"`
 */
export const useReadWafflesAmmMigratorUsdc =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesAmmMigratorAbi,
    functionName: 'usdc',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesAmmMigratorAbi}__
 */
export const useWriteWafflesAmmMigrator = /*#__PURE__*/ createUseWriteContract({
  abi: wafflesAmmMigratorAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesAmmMigratorAbi}__ and `functionName` set to `"migrate"`
 */
export const useWriteWafflesAmmMigratorMigrate =
  /*#__PURE__*/ createUseWriteContract({
    abi: wafflesAmmMigratorAbi,
    functionName: 'migrate',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesAmmMigratorAbi}__ and `functionName` set to `"setLaunchFactory"`
 */
export const useWriteWafflesAmmMigratorSetLaunchFactory =
  /*#__PURE__*/ createUseWriteContract({
    abi: wafflesAmmMigratorAbi,
    functionName: 'setLaunchFactory',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesAmmMigratorAbi}__
 */
export const useSimulateWafflesAmmMigrator =
  /*#__PURE__*/ createUseSimulateContract({ abi: wafflesAmmMigratorAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesAmmMigratorAbi}__ and `functionName` set to `"migrate"`
 */
export const useSimulateWafflesAmmMigratorMigrate =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesAmmMigratorAbi,
    functionName: 'migrate',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesAmmMigratorAbi}__ and `functionName` set to `"setLaunchFactory"`
 */
export const useSimulateWafflesAmmMigratorSetLaunchFactory =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesAmmMigratorAbi,
    functionName: 'setLaunchFactory',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__
 */
export const useReadWafflesAmmPair = /*#__PURE__*/ createUseReadContract({
  abi: wafflesAmmPairAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"BPS_DENOM"`
 */
export const useReadWafflesAmmPairBpsDenom =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesAmmPairAbi,
    functionName: 'BPS_DENOM',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"FEE_BPS"`
 */
export const useReadWafflesAmmPairFeeBps = /*#__PURE__*/ createUseReadContract({
  abi: wafflesAmmPairAbi,
  functionName: 'FEE_BPS',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"MINIMUM_LIQUIDITY"`
 */
export const useReadWafflesAmmPairMinimumLiquidity =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesAmmPairAbi,
    functionName: 'MINIMUM_LIQUIDITY',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"allowance"`
 */
export const useReadWafflesAmmPairAllowance =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesAmmPairAbi,
    functionName: 'allowance',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"balanceOf"`
 */
export const useReadWafflesAmmPairBalanceOf =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesAmmPairAbi,
    functionName: 'balanceOf',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"decimals"`
 */
export const useReadWafflesAmmPairDecimals =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesAmmPairAbi,
    functionName: 'decimals',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"factory"`
 */
export const useReadWafflesAmmPairFactory = /*#__PURE__*/ createUseReadContract(
  { abi: wafflesAmmPairAbi, functionName: 'factory' },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"getReserves"`
 */
export const useReadWafflesAmmPairGetReserves =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesAmmPairAbi,
    functionName: 'getReserves',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"name"`
 */
export const useReadWafflesAmmPairName = /*#__PURE__*/ createUseReadContract({
  abi: wafflesAmmPairAbi,
  functionName: 'name',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"symbol"`
 */
export const useReadWafflesAmmPairSymbol = /*#__PURE__*/ createUseReadContract({
  abi: wafflesAmmPairAbi,
  functionName: 'symbol',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"token0"`
 */
export const useReadWafflesAmmPairToken0 = /*#__PURE__*/ createUseReadContract({
  abi: wafflesAmmPairAbi,
  functionName: 'token0',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"token1"`
 */
export const useReadWafflesAmmPairToken1 = /*#__PURE__*/ createUseReadContract({
  abi: wafflesAmmPairAbi,
  functionName: 'token1',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"totalSupply"`
 */
export const useReadWafflesAmmPairTotalSupply =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesAmmPairAbi,
    functionName: 'totalSupply',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__
 */
export const useWriteWafflesAmmPair = /*#__PURE__*/ createUseWriteContract({
  abi: wafflesAmmPairAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"approve"`
 */
export const useWriteWafflesAmmPairApprove =
  /*#__PURE__*/ createUseWriteContract({
    abi: wafflesAmmPairAbi,
    functionName: 'approve',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"burn"`
 */
export const useWriteWafflesAmmPairBurn = /*#__PURE__*/ createUseWriteContract({
  abi: wafflesAmmPairAbi,
  functionName: 'burn',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"mint"`
 */
export const useWriteWafflesAmmPairMint = /*#__PURE__*/ createUseWriteContract({
  abi: wafflesAmmPairAbi,
  functionName: 'mint',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"skim"`
 */
export const useWriteWafflesAmmPairSkim = /*#__PURE__*/ createUseWriteContract({
  abi: wafflesAmmPairAbi,
  functionName: 'skim',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"swap"`
 */
export const useWriteWafflesAmmPairSwap = /*#__PURE__*/ createUseWriteContract({
  abi: wafflesAmmPairAbi,
  functionName: 'swap',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"sync"`
 */
export const useWriteWafflesAmmPairSync = /*#__PURE__*/ createUseWriteContract({
  abi: wafflesAmmPairAbi,
  functionName: 'sync',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"transfer"`
 */
export const useWriteWafflesAmmPairTransfer =
  /*#__PURE__*/ createUseWriteContract({
    abi: wafflesAmmPairAbi,
    functionName: 'transfer',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useWriteWafflesAmmPairTransferFrom =
  /*#__PURE__*/ createUseWriteContract({
    abi: wafflesAmmPairAbi,
    functionName: 'transferFrom',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__
 */
export const useSimulateWafflesAmmPair =
  /*#__PURE__*/ createUseSimulateContract({ abi: wafflesAmmPairAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"approve"`
 */
export const useSimulateWafflesAmmPairApprove =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesAmmPairAbi,
    functionName: 'approve',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"burn"`
 */
export const useSimulateWafflesAmmPairBurn =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesAmmPairAbi,
    functionName: 'burn',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"mint"`
 */
export const useSimulateWafflesAmmPairMint =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesAmmPairAbi,
    functionName: 'mint',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"skim"`
 */
export const useSimulateWafflesAmmPairSkim =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesAmmPairAbi,
    functionName: 'skim',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"swap"`
 */
export const useSimulateWafflesAmmPairSwap =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesAmmPairAbi,
    functionName: 'swap',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"sync"`
 */
export const useSimulateWafflesAmmPairSync =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesAmmPairAbi,
    functionName: 'sync',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"transfer"`
 */
export const useSimulateWafflesAmmPairTransfer =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesAmmPairAbi,
    functionName: 'transfer',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useSimulateWafflesAmmPairTransferFrom =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesAmmPairAbi,
    functionName: 'transferFrom',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesAmmPairAbi}__
 */
export const useWatchWafflesAmmPairEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: wafflesAmmPairAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `eventName` set to `"Approval"`
 */
export const useWatchWafflesAmmPairApprovalEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: wafflesAmmPairAbi,
    eventName: 'Approval',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `eventName` set to `"Burn"`
 */
export const useWatchWafflesAmmPairBurnEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: wafflesAmmPairAbi,
    eventName: 'Burn',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `eventName` set to `"Mint"`
 */
export const useWatchWafflesAmmPairMintEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: wafflesAmmPairAbi,
    eventName: 'Mint',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `eventName` set to `"Swap"`
 */
export const useWatchWafflesAmmPairSwapEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: wafflesAmmPairAbi,
    eventName: 'Swap',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `eventName` set to `"Sync"`
 */
export const useWatchWafflesAmmPairSyncEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: wafflesAmmPairAbi,
    eventName: 'Sync',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesAmmPairAbi}__ and `eventName` set to `"Transfer"`
 */
export const useWatchWafflesAmmPairTransferEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: wafflesAmmPairAbi,
    eventName: 'Transfer',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmRouterAbi}__
 */
export const useReadWafflesAmmRouter = /*#__PURE__*/ createUseReadContract({
  abi: wafflesAmmRouterAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmRouterAbi}__ and `functionName` set to `"BPS_DENOM"`
 */
export const useReadWafflesAmmRouterBpsDenom =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesAmmRouterAbi,
    functionName: 'BPS_DENOM',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmRouterAbi}__ and `functionName` set to `"FEE_NUM"`
 */
export const useReadWafflesAmmRouterFeeNum =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesAmmRouterAbi,
    functionName: 'FEE_NUM',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmRouterAbi}__ and `functionName` set to `"factory"`
 */
export const useReadWafflesAmmRouterFactory =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesAmmRouterAbi,
    functionName: 'factory',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesAmmRouterAbi}__ and `functionName` set to `"quoteExactInput"`
 */
export const useReadWafflesAmmRouterQuoteExactInput =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesAmmRouterAbi,
    functionName: 'quoteExactInput',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesAmmRouterAbi}__
 */
export const useWriteWafflesAmmRouter = /*#__PURE__*/ createUseWriteContract({
  abi: wafflesAmmRouterAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesAmmRouterAbi}__ and `functionName` set to `"swapExactTokensForTokens"`
 */
export const useWriteWafflesAmmRouterSwapExactTokensForTokens =
  /*#__PURE__*/ createUseWriteContract({
    abi: wafflesAmmRouterAbi,
    functionName: 'swapExactTokensForTokens',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesAmmRouterAbi}__
 */
export const useSimulateWafflesAmmRouter =
  /*#__PURE__*/ createUseSimulateContract({ abi: wafflesAmmRouterAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesAmmRouterAbi}__ and `functionName` set to `"swapExactTokensForTokens"`
 */
export const useSimulateWafflesAmmRouterSwapExactTokensForTokens =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesAmmRouterAbi,
    functionName: 'swapExactTokensForTokens',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesAmmRouterAbi}__
 */
export const useWatchWafflesAmmRouterEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: wafflesAmmRouterAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesAmmRouterAbi}__ and `eventName` set to `"SwapExactIn"`
 */
export const useWatchWafflesAmmRouterSwapExactInEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: wafflesAmmRouterAbi,
    eventName: 'SwapExactIn',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__
 */
export const useReadWafflesBondingCurve = /*#__PURE__*/ createUseReadContract({
  abi: wafflesBondingCurveAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"BPS_DENOM"`
 */
export const useReadWafflesBondingCurveBpsDenom =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'BPS_DENOM',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"PRICE_SCALE"`
 */
export const useReadWafflesBondingCurvePriceScale =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'PRICE_SCALE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"canGraduate"`
 */
export const useReadWafflesBondingCurveCanGraduate =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'canGraduate',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"creator"`
 */
export const useReadWafflesBondingCurveCreator =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'creator',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"creatorEarnings"`
 */
export const useReadWafflesBondingCurveCreatorEarnings =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'creatorEarnings',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"currentPrice"`
 */
export const useReadWafflesBondingCurveCurrentPrice =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'currentPrice',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"feeBps"`
 */
export const useReadWafflesBondingCurveFeeBps =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'feeBps',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"graduated"`
 */
export const useReadWafflesBondingCurveGraduated =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'graduated',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"graduationMarketCap"`
 */
export const useReadWafflesBondingCurveGraduationMarketCap =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'graduationMarketCap',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"graduationMarketCapTarget"`
 */
export const useReadWafflesBondingCurveGraduationMarketCapTarget =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'graduationMarketCapTarget',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"graduationPool"`
 */
export const useReadWafflesBondingCurveGraduationPool =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'graduationPool',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"graduationPrice"`
 */
export const useReadWafflesBondingCurveGraduationPrice =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'graduationPrice',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"graduationProgressBps"`
 */
export const useReadWafflesBondingCurveGraduationProgressBps =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'graduationProgressBps',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"initialVirtualTokenReserve"`
 */
export const useReadWafflesBondingCurveInitialVirtualTokenReserve =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'initialVirtualTokenReserve',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"initialVirtualUsdcReserve"`
 */
export const useReadWafflesBondingCurveInitialVirtualUsdcReserve =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'initialVirtualUsdcReserve',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"k"`
 */
export const useReadWafflesBondingCurveK = /*#__PURE__*/ createUseReadContract({
  abi: wafflesBondingCurveAbi,
  functionName: 'k',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"liquidityTokenReserve"`
 */
export const useReadWafflesBondingCurveLiquidityTokenReserve =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'liquidityTokenReserve',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"marketCap"`
 */
export const useReadWafflesBondingCurveMarketCap =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'marketCap',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"migrator"`
 */
export const useReadWafflesBondingCurveMigrator =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'migrator',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"minVirtualTokenReserve"`
 */
export const useReadWafflesBondingCurveMinVirtualTokenReserve =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'minVirtualTokenReserve',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"protocolFeeBps"`
 */
export const useReadWafflesBondingCurveProtocolFeeBps =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'protocolFeeBps',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"quoteBuy"`
 */
export const useReadWafflesBondingCurveQuoteBuy =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'quoteBuy',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"quoteSell"`
 */
export const useReadWafflesBondingCurveQuoteSell =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'quoteSell',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"reserveUsdc"`
 */
export const useReadWafflesBondingCurveReserveUsdc =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'reserveUsdc',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"sellableTokens"`
 */
export const useReadWafflesBondingCurveSellableTokens =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'sellableTokens',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"targetVirtualUsdcReserve"`
 */
export const useReadWafflesBondingCurveTargetVirtualUsdcReserve =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'targetVirtualUsdcReserve',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"token"`
 */
export const useReadWafflesBondingCurveToken =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'token',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"totalSupply_"`
 */
export const useReadWafflesBondingCurveTotalSupply =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'totalSupply_',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"treasury"`
 */
export const useReadWafflesBondingCurveTreasury =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'treasury',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"usdc"`
 */
export const useReadWafflesBondingCurveUsdc =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'usdc',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"virtualTokenReserve"`
 */
export const useReadWafflesBondingCurveVirtualTokenReserve =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'virtualTokenReserve',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"virtualUsdcReserve"`
 */
export const useReadWafflesBondingCurveVirtualUsdcReserve =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'virtualUsdcReserve',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__
 */
export const useWriteWafflesBondingCurve = /*#__PURE__*/ createUseWriteContract(
  { abi: wafflesBondingCurveAbi },
)

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"buy"`
 */
export const useWriteWafflesBondingCurveBuy =
  /*#__PURE__*/ createUseWriteContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'buy',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"claimCreatorFees"`
 */
export const useWriteWafflesBondingCurveClaimCreatorFees =
  /*#__PURE__*/ createUseWriteContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'claimCreatorFees',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"graduate"`
 */
export const useWriteWafflesBondingCurveGraduate =
  /*#__PURE__*/ createUseWriteContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'graduate',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"sell"`
 */
export const useWriteWafflesBondingCurveSell =
  /*#__PURE__*/ createUseWriteContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'sell',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__
 */
export const useSimulateWafflesBondingCurve =
  /*#__PURE__*/ createUseSimulateContract({ abi: wafflesBondingCurveAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"buy"`
 */
export const useSimulateWafflesBondingCurveBuy =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'buy',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"claimCreatorFees"`
 */
export const useSimulateWafflesBondingCurveClaimCreatorFees =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'claimCreatorFees',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"graduate"`
 */
export const useSimulateWafflesBondingCurveGraduate =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'graduate',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `functionName` set to `"sell"`
 */
export const useSimulateWafflesBondingCurveSell =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesBondingCurveAbi,
    functionName: 'sell',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesBondingCurveAbi}__
 */
export const useWatchWafflesBondingCurveEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: wafflesBondingCurveAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `eventName` set to `"CreatorFeesClaimed"`
 */
export const useWatchWafflesBondingCurveCreatorFeesClaimedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: wafflesBondingCurveAbi,
    eventName: 'CreatorFeesClaimed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `eventName` set to `"Graduated"`
 */
export const useWatchWafflesBondingCurveGraduatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: wafflesBondingCurveAbi,
    eventName: 'Graduated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesBondingCurveAbi}__ and `eventName` set to `"Traded"`
 */
export const useWatchWafflesBondingCurveTradedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: wafflesBondingCurveAbi,
    eventName: 'Traded',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__
 */
export const useReadWafflesLaunchFactory = /*#__PURE__*/ createUseReadContract({
  abi: wafflesLaunchFactoryAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"TOKEN_SUPPLY"`
 */
export const useReadWafflesLaunchFactoryTokenSupply =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'TOKEN_SUPPLY',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"allTokens"`
 */
export const useReadWafflesLaunchFactoryAllTokens =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'allTokens',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"allTokensLength"`
 */
export const useReadWafflesLaunchFactoryAllTokensLength =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'allTokensLength',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"creationFee"`
 */
export const useReadWafflesLaunchFactoryCreationFee =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'creationFee',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"feeBps"`
 */
export const useReadWafflesLaunchFactoryFeeBps =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'feeBps',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"initialVirtualTokenReserve"`
 */
export const useReadWafflesLaunchFactoryInitialVirtualTokenReserve =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'initialVirtualTokenReserve',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"initialVirtualUsdcReserve"`
 */
export const useReadWafflesLaunchFactoryInitialVirtualUsdcReserve =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'initialVirtualUsdcReserve',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"launchOfToken"`
 */
export const useReadWafflesLaunchFactoryLaunchOfToken =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'launchOfToken',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"migrator"`
 */
export const useReadWafflesLaunchFactoryMigrator =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'migrator',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"minVirtualTokenReserve"`
 */
export const useReadWafflesLaunchFactoryMinVirtualTokenReserve =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'minVirtualTokenReserve',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"owner"`
 */
export const useReadWafflesLaunchFactoryOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'owner',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"pendingOwner"`
 */
export const useReadWafflesLaunchFactoryPendingOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'pendingOwner',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"protocolFeeBps"`
 */
export const useReadWafflesLaunchFactoryProtocolFeeBps =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'protocolFeeBps',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"tokenOfCurve"`
 */
export const useReadWafflesLaunchFactoryTokenOfCurve =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'tokenOfCurve',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"treasury"`
 */
export const useReadWafflesLaunchFactoryTreasury =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'treasury',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"usdc"`
 */
export const useReadWafflesLaunchFactoryUsdc =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'usdc',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__
 */
export const useWriteWafflesLaunchFactory =
  /*#__PURE__*/ createUseWriteContract({ abi: wafflesLaunchFactoryAbi })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"acceptOwnership"`
 */
export const useWriteWafflesLaunchFactoryAcceptOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'acceptOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"createToken"`
 */
export const useWriteWafflesLaunchFactoryCreateToken =
  /*#__PURE__*/ createUseWriteContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'createToken',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"setCreationFee"`
 */
export const useWriteWafflesLaunchFactorySetCreationFee =
  /*#__PURE__*/ createUseWriteContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'setCreationFee',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useWriteWafflesLaunchFactoryTransferOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__
 */
export const useSimulateWafflesLaunchFactory =
  /*#__PURE__*/ createUseSimulateContract({ abi: wafflesLaunchFactoryAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"acceptOwnership"`
 */
export const useSimulateWafflesLaunchFactoryAcceptOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'acceptOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"createToken"`
 */
export const useSimulateWafflesLaunchFactoryCreateToken =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'createToken',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"setCreationFee"`
 */
export const useSimulateWafflesLaunchFactorySetCreationFee =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'setCreationFee',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useSimulateWafflesLaunchFactoryTransferOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesLaunchFactoryAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__
 */
export const useWatchWafflesLaunchFactoryEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: wafflesLaunchFactoryAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `eventName` set to `"CreationFeeUpdated"`
 */
export const useWatchWafflesLaunchFactoryCreationFeeUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: wafflesLaunchFactoryAbi,
    eventName: 'CreationFeeUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `eventName` set to `"OwnershipTransferStarted"`
 */
export const useWatchWafflesLaunchFactoryOwnershipTransferStartedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: wafflesLaunchFactoryAbi,
    eventName: 'OwnershipTransferStarted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const useWatchWafflesLaunchFactoryOwnershipTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: wafflesLaunchFactoryAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesLaunchFactoryAbi}__ and `eventName` set to `"TokenCreated"`
 */
export const useWatchWafflesLaunchFactoryTokenCreatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: wafflesLaunchFactoryAbi,
    eventName: 'TokenCreated',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesMemeTokenAbi}__
 */
export const useReadWafflesMemeToken = /*#__PURE__*/ createUseReadContract({
  abi: wafflesMemeTokenAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesMemeTokenAbi}__ and `functionName` set to `"allowance"`
 */
export const useReadWafflesMemeTokenAllowance =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesMemeTokenAbi,
    functionName: 'allowance',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesMemeTokenAbi}__ and `functionName` set to `"balanceOf"`
 */
export const useReadWafflesMemeTokenBalanceOf =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesMemeTokenAbi,
    functionName: 'balanceOf',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesMemeTokenAbi}__ and `functionName` set to `"decimals"`
 */
export const useReadWafflesMemeTokenDecimals =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesMemeTokenAbi,
    functionName: 'decimals',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesMemeTokenAbi}__ and `functionName` set to `"name"`
 */
export const useReadWafflesMemeTokenName = /*#__PURE__*/ createUseReadContract({
  abi: wafflesMemeTokenAbi,
  functionName: 'name',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesMemeTokenAbi}__ and `functionName` set to `"symbol"`
 */
export const useReadWafflesMemeTokenSymbol =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesMemeTokenAbi,
    functionName: 'symbol',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wafflesMemeTokenAbi}__ and `functionName` set to `"totalSupply"`
 */
export const useReadWafflesMemeTokenTotalSupply =
  /*#__PURE__*/ createUseReadContract({
    abi: wafflesMemeTokenAbi,
    functionName: 'totalSupply',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesMemeTokenAbi}__
 */
export const useWriteWafflesMemeToken = /*#__PURE__*/ createUseWriteContract({
  abi: wafflesMemeTokenAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesMemeTokenAbi}__ and `functionName` set to `"approve"`
 */
export const useWriteWafflesMemeTokenApprove =
  /*#__PURE__*/ createUseWriteContract({
    abi: wafflesMemeTokenAbi,
    functionName: 'approve',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesMemeTokenAbi}__ and `functionName` set to `"transfer"`
 */
export const useWriteWafflesMemeTokenTransfer =
  /*#__PURE__*/ createUseWriteContract({
    abi: wafflesMemeTokenAbi,
    functionName: 'transfer',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wafflesMemeTokenAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useWriteWafflesMemeTokenTransferFrom =
  /*#__PURE__*/ createUseWriteContract({
    abi: wafflesMemeTokenAbi,
    functionName: 'transferFrom',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesMemeTokenAbi}__
 */
export const useSimulateWafflesMemeToken =
  /*#__PURE__*/ createUseSimulateContract({ abi: wafflesMemeTokenAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesMemeTokenAbi}__ and `functionName` set to `"approve"`
 */
export const useSimulateWafflesMemeTokenApprove =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesMemeTokenAbi,
    functionName: 'approve',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesMemeTokenAbi}__ and `functionName` set to `"transfer"`
 */
export const useSimulateWafflesMemeTokenTransfer =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesMemeTokenAbi,
    functionName: 'transfer',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wafflesMemeTokenAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useSimulateWafflesMemeTokenTransferFrom =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wafflesMemeTokenAbi,
    functionName: 'transferFrom',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesMemeTokenAbi}__
 */
export const useWatchWafflesMemeTokenEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: wafflesMemeTokenAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesMemeTokenAbi}__ and `eventName` set to `"Approval"`
 */
export const useWatchWafflesMemeTokenApprovalEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: wafflesMemeTokenAbi,
    eventName: 'Approval',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wafflesMemeTokenAbi}__ and `eventName` set to `"Transfer"`
 */
export const useWatchWafflesMemeTokenTransferEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: wafflesMemeTokenAbi,
    eventName: 'Transfer',
  })
