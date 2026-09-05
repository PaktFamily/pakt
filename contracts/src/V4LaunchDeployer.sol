// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {V4LaunchToken} from "./V4LaunchToken.sol";

struct LaunchDeployment {
    address originalDeployer;
    address supplyRecipient;
    uint256 supply;
    bytes32 salt;
    string name;
    string symbol;
    string logo;
    string description;
    V4LaunchToken.Socials socials;
}

contract V4LaunchDeployer {
    uint256 private constant MAX_NAME_LENGTH = 64;
    uint256 private constant MAX_SYMBOL_LENGTH = 16;
    uint256 private constant MAX_LOGO_LENGTH = 512;
    uint256 private constant MAX_DESCRIPTION_LENGTH = 2048;
    uint256 private constant MAX_SOCIAL_LENGTH = 256;

    error NotFactory();
    error MetadataTooLong();

    address public immutable factory;

    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory();
        _;
    }

    constructor(address factory_) {
        if (factory_ == address(0)) revert NotFactory();
        factory = factory_;
    }

    function deployToken(LaunchDeployment calldata params) external onlyFactory returns (address token) {
        _requireMetadataWithinLimits(params);

        bytes32 tokenSalt = keccak256(abi.encode(params.originalDeployer, params.salt));
        token = address(
            new V4LaunchToken{salt: tokenSalt}(
                params.name,
                params.symbol,
                params.logo,
                params.description,
                params.socials,
                params.originalDeployer,
                factory,
                params.supplyRecipient,
                params.supply
            )
        );
    }

    function predictTokenAddress(LaunchDeployment calldata params) external view returns (address) {
        bytes32 tokenSalt = keccak256(abi.encode(params.originalDeployer, params.salt));
        bytes32 initCodeHash = keccak256(
            abi.encodePacked(
                type(V4LaunchToken).creationCode,
                abi.encode(
                    params.name,
                    params.symbol,
                    params.logo,
                    params.description,
                    params.socials,
                    params.originalDeployer,
                    factory,
                    params.supplyRecipient,
                    params.supply
                )
            )
        );
        return
            address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), tokenSalt, initCodeHash)))));
    }

    function _requireMetadataWithinLimits(LaunchDeployment calldata params) private pure {
        if (
            bytes(params.name).length > MAX_NAME_LENGTH || bytes(params.symbol).length > MAX_SYMBOL_LENGTH
                || bytes(params.logo).length > MAX_LOGO_LENGTH
                || bytes(params.description).length > MAX_DESCRIPTION_LENGTH
        ) {
            revert MetadataTooLong();
        }
        if (
            bytes(params.socials.twitter).length > MAX_SOCIAL_LENGTH
                || bytes(params.socials.telegram).length > MAX_SOCIAL_LENGTH
                || bytes(params.socials.discord).length > MAX_SOCIAL_LENGTH
                || bytes(params.socials.website).length > MAX_SOCIAL_LENGTH
                || bytes(params.socials.farcaster).length > MAX_SOCIAL_LENGTH
        ) {
            revert MetadataTooLong();
        }
    }
}
