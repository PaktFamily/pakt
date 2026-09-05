// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IV4LaunchFeeEscrow {
    function credit(address recipient) external payable;
    function creditToken(address recipient, address token, uint256 amount) external;
    function claim() external returns (uint256 amount);
    function claim(uint256 amount) external returns (uint256);
    function claimToken(address token) external returns (uint256 amount);
    function claimToken(address token, uint256 amount) external returns (uint256);
    function balanceOf(address recipient) external view returns (uint256);
    function balanceOfToken(address recipient, address token) external view returns (uint256);
}

interface IERC721ReceiverLike {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);
}

interface IV4LaunchFactory {
    struct LaunchedToken {
        address token;
        address deployer;
        address creatorFeeRecipient;
        address pairToken;
        uint256 phantomQuote;
        uint24 poolFee;
        int24 tickSpacing;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint256 positionId;
        uint16 baseFeeBps;
        uint16 creatorTaxBps;
        uint16 protocolFeeShareBps;
        address protocolFeeRecipient;
        uint64 launchedAt;
        bool exists;
    }

    function getLaunchedToken(address token) external view returns (LaunchedToken memory);
}
