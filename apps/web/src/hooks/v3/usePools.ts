import { BigintIsh, Currency, Token } from '@pancakeswap/swap-sdk-core'
import { DEPLOYER_ADDRESSES, FeeAmount, Pool, computePoolAddress } from '@pancakeswap/v3-sdk'
import { v3PoolStateABI } from 'config/abi/v3PoolState'
import { useActiveChainId } from 'hooks/useActiveChainId'
import { useMemo } from 'react'
import { Address } from 'viem'
import { publicClient } from 'utils/viem'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { QUERY_SETTINGS_WITHOUT_INTERVAL_REFETCH, QUERY_SETTINGS_IMMUTABLE } from 'config/constants'
import { useMultipleContractSingleData } from 'state/multicall/hooks'
import { PoolState } from './types'

// Classes are expensive to instantiate, so this caches the recently instantiated pools.
// This avoids re-instantiating pools as the other pools in the same request are loaded.
class PoolCache {
  // Evict after 128 entries. Empirically, a swap uses 64 entries.
  private static MAX_ENTRIES = 128

  // These are FIFOs, using unshift/pop. This makes recent entries faster to find.
  private static pools: Pool[] = []

  private static addresses: { key: string; address: string }[] = []

  static getPoolAddress(deployerAddress: Address, tokenA: Token, tokenB: Token, fee: FeeAmount): Address {
    if (this.addresses.length > this.MAX_ENTRIES) {
      this.addresses = this.addresses.slice(0, this.MAX_ENTRIES / 2)
    }

    const { address: addressA } = tokenA
    const { address: addressB } = tokenB
    const key = `${deployerAddress}:${addressA}:${addressB}:${fee.toString()}`

    const found = this.addresses.find((address) => address.key === key)
    if (found) return found.address as Address

    const address = {
      key,
      address: computePoolAddress({
        deployerAddress,
        tokenA,
        tokenB,
        fee,
      }),
    }

    this.addresses.unshift(address)
    return address.address
  }

  static getPool(
    tokenA: Token,
    tokenB: Token,
    fee: FeeAmount,
    sqrtPriceX96: BigintIsh,
    liquidity: BigintIsh,
    tick: number,
    feeProtocol?: number,
  ): Pool {
    if (this.pools.length > this.MAX_ENTRIES) {
      this.pools = this.pools.slice(0, this.MAX_ENTRIES / 2)
    }

    const found = this.pools.find(
      (pool) =>
        pool.token0 === tokenA &&
        pool.token1 === tokenB &&
        pool.fee === fee &&
        pool.sqrtRatioX96 === sqrtPriceX96 &&
        pool.liquidity === liquidity &&
        pool.tickCurrent === tick,
    )
    if (found) return found

    const pool = new Pool(tokenA, tokenB, fee, sqrtPriceX96, liquidity, tick)
    pool.feeProtocol = feeProtocol
    this.pools.unshift(pool)
    return pool
  }
}

export function usePools(
  poolKeys: [Currency | undefined | null, Currency | undefined | null, FeeAmount | undefined][],
): [PoolState, Pool | null][] {
  const { chainId } = useActiveChainId()

  const poolTokens: ([Token, Token, FeeAmount] | undefined)[] = useMemo(() => {
    if (!chainId) return new Array(poolKeys.length)

    return poolKeys.map(([currencyA, currencyB, feeAmount]) => {
      if (currencyA && currencyB && feeAmount) {
        const tokenA = currencyA.wrapped
        const tokenB = currencyB.wrapped
        if (tokenA.equals(tokenB)) return undefined

        return tokenA.sortsBefore(tokenB) ? [tokenA, tokenB, feeAmount] : [tokenB, tokenA, feeAmount]
      }
      return undefined
    })
  }, [chainId, poolKeys])

  const poolAddresses: (Address | undefined)[] = useMemo(() => {
    const v3CoreDeployerAddress = chainId && DEPLOYER_ADDRESSES[chainId]
    if (!v3CoreDeployerAddress) return new Array(poolTokens.length)

    return poolTokens.map((value) => value && PoolCache.getPoolAddress(v3CoreDeployerAddress, ...value))
  }, [chainId, poolTokens])

  const slot0s = useMultipleContractSingleData({
    addresses: poolAddresses,
    abi: v3PoolStateABI,
    functionName: 'slot0',
  })
  const liquidities = useMultipleContractSingleData({
    addresses: poolAddresses,
    abi: v3PoolStateABI,
    functionName: 'liquidity',
  })

  return useMemo(() => {
    return poolKeys.map((_key, index) => {
      const tokens = poolTokens[index]
      if (!tokens) return [PoolState.INVALID, null]
      const [token0, token1, fee] = tokens

      if (!slot0s[index]) return [PoolState.INVALID, null]
      const { result: slot0, loading: slot0Loading, valid: slot0Valid } = slot0s[index]

      if (!liquidities[index]) return [PoolState.INVALID, null]
      const { result: liquidity, loading: liquidityLoading, valid: liquidityValid } = liquidities[index]

      if (!tokens || !slot0Valid || !liquidityValid) return [PoolState.INVALID, null]
      if (slot0Loading || liquidityLoading) return [PoolState.LOADING, null]
      if (!slot0 || typeof liquidity === 'undefined') return [PoolState.NOT_EXISTS, null]
      const [sqrtPriceX96, tick, , , , feeProtocol] = slot0
      if (!sqrtPriceX96 || sqrtPriceX96 === 0n) return [PoolState.NOT_EXISTS, null]

      try {
        const pool = PoolCache.getPool(token0, token1, fee, sqrtPriceX96, liquidity, tick, feeProtocol)
        return [PoolState.EXISTS, pool]
      } catch (error) {
        console.error('Error when constructing the pool', error)
        return [PoolState.NOT_EXISTS, null]
      }
    })
  }, [liquidities, poolKeys, slot0s, poolTokens])
}

export function usePool(
  currencyA: Currency | undefined | null,
  currencyB: Currency | undefined | null,
  feeAmount: FeeAmount | undefined,
): [PoolState, Pool | null] {
  const poolKeys: [Currency | undefined | null, Currency | undefined | null, FeeAmount | undefined][] = useMemo(
    () => [[currencyA, currencyB, feeAmount]],
    [currencyA, currencyB, feeAmount],
  )

  return usePools(poolKeys)[0]
}

export function usePoolsWithMultiChains(
  poolKeys: [Currency | undefined | null, Currency | undefined | null, FeeAmount | undefined][],
): [PoolState, Pool | null][] {
  const poolTokens: ([Token, Token, FeeAmount] | undefined)[] = useMemo(() => {
    return poolKeys.map(([currencyA, currencyB, feeAmount]) => {
      if (currencyA && currencyB && feeAmount) {
        const tokenA = currencyA.wrapped
        const tokenB = currencyB.wrapped
        if (tokenA.equals(tokenB)) return undefined

        return tokenA.sortsBefore(tokenB) ? [tokenA, tokenB, feeAmount] : [tokenB, tokenA, feeAmount]
      }
      return undefined
    })
  }, [poolKeys])

  const poolAddressMap: { [chainId: number]: Address[] } = useMemo(() => {
    return poolTokens.reduce((acc, value) => {
      if (!value) {
        return acc
      }
      const { chainId } = value[0]
      const v3CoreDeployerAddress = DEPLOYER_ADDRESSES[chainId]
      const addr = PoolCache.getPoolAddress(v3CoreDeployerAddress, ...value)
      // eslint-disable-next-line no-param-reassign
      acc[chainId] = acc[chainId] ?? []
      acc[chainId].push(addr)
      return acc
    }, {})
  }, [poolTokens])

  const chainIds = useMemo(() => Object.keys(poolAddressMap), [poolAddressMap])
  const poolAddressesString = useMemo(
    () => chainIds.flatMap((chainId) => poolAddressMap[chainId]).join(','),
    [chainIds, poolAddressMap],
  )

  const { data: poolInfoByChainId } = useQuery({
    queryKey: ['v3PoolInfo', chainIds.join(','), poolAddressesString],
    queryFn: async () => {
      const results = await Promise.all(
        chainIds.map(async (chainId) => {
          const poolAddresses: Address[] = poolAddressMap[chainId]
          const client = publicClient({ chainId: Number(chainId) })

          const slot0Calls = poolAddresses.map((addr) => ({
            address: addr,
            abi: v3PoolStateABI,
            functionName: 'slot0',
          }))

          const liquidityCalls = poolAddresses.map((addr) => ({
            address: addr,
            abi: v3PoolStateABI,
            functionName: 'liquidity',
          }))

          try {
            const [slot0Data, liquidityData] = await Promise.all([
              client.multicall({
                contracts: slot0Calls,
                allowFailure: false,
              }),
              client.multicall({
                contracts: liquidityCalls,
                allowFailure: false,
              }),
            ])

            return { [chainId]: { slot0: slot0Data, liquidity: liquidityData } }
          } catch (error) {
            console.error(`Error fetching data for chainId ${chainId}:`, error)
            return { [chainId]: { slot0: undefined, liquidity: undefined } }
          }
        }),
      )
      return results.reduce((acc, result) => {
        const chainId = Object.keys(result)[0]
        // eslint-disable-next-line no-param-reassign
        acc[chainId] = result[chainId]
        return acc
      }, {} as { slot0: [bigint, number, number, number, number, number, boolean]; liquidity: [bigint, number, number, number, number, number, boolean] })
    },
    enabled: chainIds?.length > 0,
    placeholderData: keepPreviousData,
    ...QUERY_SETTINGS_IMMUTABLE,
    ...QUERY_SETTINGS_WITHOUT_INTERVAL_REFETCH,
  })

  return useMemo(() => {
    const indexMap = {}
    return poolKeys.map((_key, index) => {
      const tokens = poolTokens[index]
      if (!tokens) return [PoolState.INVALID, null]
      const [token0, token1, fee] = tokens

      indexMap[token0.chainId] = (indexMap[token0.chainId] ?? -1) + 1
      const { slot0: slot0s = [], liquidity: liquidities = [] } = poolInfoByChainId?.[token0.chainId] || {}
      const slot0 = slot0s[indexMap[token0.chainId]]
      const liquidity = liquidities[indexMap[token0.chainId]]
      if (typeof slot0 === 'undefined' || typeof liquidity === 'undefined') return [PoolState.INVALID, null]
      const [sqrtPriceX96, tick, , , , feeProtocol] = slot0
      if (!sqrtPriceX96 || sqrtPriceX96 === 0n) return [PoolState.NOT_EXISTS, null]

      try {
        const pool = PoolCache.getPool(token0, token1, fee, sqrtPriceX96, liquidity, tick, feeProtocol)
        return [PoolState.EXISTS, pool]
      } catch (error) {
        console.error('Error when constructing the pool', error)
        return [PoolState.NOT_EXISTS, null]
      }
    })
  }, [poolKeys, poolTokens, poolInfoByChainId])
}

export function usePoolByChainId(
  currencyA: Currency | undefined | null,
  currencyB: Currency | undefined | null,
  feeAmount: FeeAmount | undefined,
): [PoolState, Pool | null] {
  const poolKeys: [Currency | undefined | null, Currency | undefined | null, FeeAmount | undefined][] = useMemo(
    () => [[currencyA, currencyB, feeAmount]],
    [currencyA, currencyB, feeAmount],
  )

  return usePoolsWithMultiChains(poolKeys)[0]
}
