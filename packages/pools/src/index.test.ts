import { expect, test } from 'vitest'
import * as exports from './index'

test('exports', () => {
  expect(Object.keys(exports)).toMatchInlineSnapshot(`
    [
      "getPoolsConfig",
      "getLivePoolsConfig",
      "MAX_LOCK_DURATION",
      "UNLOCK_FREE_DURATION",
      "ONE_WEEK_DEFAULT",
      "BOOST_WEIGHT",
      "DURATION_FACTOR",
      "BOOSTED_POOLS_CONFIG_BY_CHAIN",
      "getBoostedPoolsConfig",
      "getBoostedPoolConfig",
      "ICAKE",
      "CAKE_VAULT",
      "CAKE_FLEXIBLE_SIDE_VAULT",
      "SUPPORTED_CHAIN_IDS",
      "CAKE_VAULT_SUPPORTED_CHAINS",
      "BSC_BLOCK_TIME",
      "BLOCKS_PER_DAY",
      "BLOCKS_PER_YEAR",
      "SECONDS_IN_YEAR",
      "PoolCategory",
      "VaultKey",
      "fetchPoolsTimeLimits",
      "fetchPoolsTotalStaking",
      "fetchPoolsStakingLimitsByBlock",
      "fetchPoolsStakingLimits",
      "fetchPoolsProfileRequirement",
      "fetchPoolsAllowance",
      "fetchUserBalances",
      "fetchUserStakeBalances",
      "fetchUserPendingRewards",
      "fetchPublicVaultData",
      "fetchPublicFlexibleSideVaultData",
      "fetchVaultFees",
      "getCakeFlexibleSideVaultAddress",
      "getCakeVaultAddress",
      "fetchVaultUser",
      "fetchFlexibleSideVaultUser",
      "getContractAddress",
      "isPoolsSupported",
      "isCakeVaultSupported",
      "isLegacyPool",
      "isUpgradedPool",
      "getPoolAprByTokenPerBlock",
      "getPoolAprByTokenPerSecond",
      "getSousChefBNBContract",
      "getSousChefV2Contract",
      "getSmartChefChefV2Contract",
      "getPoolContractBySousId",
      "checkIsBoostedPool",
      "getBoostedPoolApr",
      "cakeFlexibleSideVaultV2ABI",
      "cakeVaultV2ABI",
      "smartChefABI",
      "sousChefABI",
      "sousChefBnbABI",
      "sousChefV2ABI",
      "sousChefV3ABI",
    ]
  `)
})
