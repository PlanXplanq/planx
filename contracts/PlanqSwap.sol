
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PlanqSwap is Ownable {
    struct LiquidityPool {
        IERC20 tokenA;
        IERC20 tokenB;
        uint256 reserveA;
        uint256 reserveB;
    }

    mapping(address => LiquidityPool) public pools;
    mapping(address => uint256) public rewards;
    mapping(address => mapping(address => uint256)) public userLiquidity;

    IERC20 public rewardToken;
    uint256 public rewardRate; // Reward tokens per block

    event LiquidityAdded(address indexed pool, uint256 amountA, uint256 amountB);
    event LiquidityRemoved(address indexed pool, uint256 amountA, uint256 amountB);
    event TokensSwapped(address indexed pool, address indexed trader, uint256 amountIn, uint256 amountOut);
    event RewardClaimed(address indexed user, uint256 rewardAmount);

    constructor(address _rewardToken, uint256 _rewardRate) {
        rewardToken = IERC20(_rewardToken);
        rewardRate = _rewardRate;
    }

    function addLiquidity(
        address poolAddress,
        uint256 amountA,
        uint256 amountB
    ) external {
        LiquidityPool storage pool = pools[poolAddress];
        require(address(pool.tokenA) != address(0) && address(pool.tokenB) != address(0), "Pool does not exist");

        pool.tokenA.transferFrom(msg.sender, address(this), amountA);
        pool.tokenB.transferFrom(msg.sender, address(this), amountB);

        pool.reserveA += amountA;
        pool.reserveB += amountB;
        userLiquidity[msg.sender][poolAddress] += (amountA + amountB);

        emit LiquidityAdded(poolAddress, amountA, amountB);
    }

    function removeLiquidity(address poolAddress, uint256 amountA, uint256 amountB) external {
        LiquidityPool storage pool = pools[poolAddress];
        require(pool.reserveA >= amountA && pool.reserveB >= amountB, "Insufficient liquidity");
        require(userLiquidity[msg.sender][poolAddress] >= (amountA + amountB), "Not enough liquidity provided");

        pool.reserveA -= amountA;
        pool.reserveB -= amountB;
        userLiquidity[msg.sender][poolAddress] -= (amountA + amountB);

        pool.tokenA.transfer(msg.sender, amountA);
        pool.tokenB.transfer(msg.sender, amountB);

        emit LiquidityRemoved(poolAddress, amountA, amountB);
    }

    function swap(
        address poolAddress,
        address inputToken,
        uint256 amountIn
    ) external returns (uint256 amountOut) {
        LiquidityPool storage pool = pools[poolAddress];
        require(
            inputToken == address(pool.tokenA) || inputToken == address(pool.tokenB),
            "Invalid input token"
        );

        bool isTokenA = inputToken == address(pool.tokenA);
        IERC20 input = isTokenA ? pool.tokenA : pool.tokenB;
        IERC20 output = isTokenA ? pool.tokenB : pool.tokenA;

        uint256 inputReserve = isTokenA ? pool.reserveA : pool.reserveB;
        uint256 outputReserve = isTokenA ? pool.reserveB : pool.reserveA;

        require(amountIn > 0 && inputReserve > 0 && outputReserve > 0, "Invalid swap parameters");

        // Calculate output amount (constant product formula: x * y = k)
        uint256 amountInWithFee = amountIn * 990; // 1% fee
        uint256 numerator = amountInWithFee * outputReserve;
        uint256 denominator = (inputReserve * 1000) + amountInWithFee;
        amountOut = numerator / denominator;

        require(amountOut > 0, "Insufficient output amount");

        input.transferFrom(msg.sender, address(this), amountIn);
        output.transfer(msg.sender, amountOut);

        if (isTokenA) {
            pool.reserveA += amountIn;
            pool.reserveB -= amountOut;
        } else {
            pool.reserveA -= amountOut;
            pool.reserveB += amountIn;
        }

        emit TokensSwapped(poolAddress, msg.sender, amountIn, amountOut);
    }

    function createPool(address tokenA, address tokenB) external returns (address poolAddress) {
        require(tokenA != tokenB, "Identical tokens");
        require(tokenA != address(0) && tokenB != address(0), "Invalid token address");

        LiquidityPool memory newPool = LiquidityPool({
            tokenA: IERC20(tokenA),
            tokenB: IERC20(tokenB),
            reserveA: 0,
            reserveB: 0
        });

        poolAddress = address(uint160(uint256(keccak256(abi.encodePacked(tokenA, tokenB, block.timestamp)))));
        pools[poolAddress] = newPool;
    }

    function claimRewards() external {
        uint256 userReward = rewards[msg.sender];
        require(userReward > 0, "No rewards to claim");

        rewards[msg.sender] = 0;
        rewardToken.transfer(msg.sender, userReward);

        emit RewardClaimed(msg.sender, userReward);
    }

    function distributeRewards(address poolAddress) external {
        LiquidityPool storage pool = pools[poolAddress];
        uint256 totalLiquidity = pool.reserveA + pool.reserveB;
        require(totalLiquidity > 0, "No liquidity in pool");

        uint256 rewardPerUnit = (rewardRate * block.number) / totalLiquidity;

        for (address user : getAllLiquidityProviders(poolAddress)) {
            rewards[user] += userLiquidity[user][poolAddress] * rewardPerUnit;
        }
    }

    function getAllLiquidityProviders(address poolAddress) internal view returns (address[] memory) {
        // Placeholder: Implement logic to track and retrieve all unique liquidity providers
        address[] memory providers;
        return providers;
    }
}
