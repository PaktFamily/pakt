// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract V4LaunchToken is ERC20, ERC20Burnable {
    struct Socials {
        string twitter;
        string telegram;
        string discord;
        string website;
        string farcaster;
    }

    error ZeroAddress();

    address public immutable deployer;
    address public immutable launchFactory;

    string public logo;
    string public description;

    Socials private _socials;

    constructor(
        string memory name_,
        string memory symbol_,
        string memory logo_,
        string memory description_,
        Socials memory socials_,
        address deployer_,
        address launchFactory_,
        address supplyRecipient_,
        uint256 supply_
    ) ERC20(name_, symbol_) {
        if (deployer_ == address(0) || supplyRecipient_ == address(0) || launchFactory_ == address(0)) {
            revert ZeroAddress();
        }

        deployer = deployer_;
        launchFactory = launchFactory_;
        logo = logo_;
        description = description_;
        _socials = socials_;

        _mint(supplyRecipient_, supply_);
    }

    function socials()
        external
        view
        returns (
            string memory twitter,
            string memory telegram,
            string memory discord,
            string memory website,
            string memory farcaster
        )
    {
        Socials memory values = _socials;
        return (values.twitter, values.telegram, values.discord, values.website, values.farcaster);
    }

    function getTokenInfo()
        external
        view
        returns (
            address tokenDeployer,
            string memory tokenLogo,
            string memory tokenDescription,
            Socials memory tokenSocials
        )
    {
        return (deployer, logo, description, _socials);
    }

    function contractURI() external view returns (string memory) {
        return _metadata();
    }

    function tokenURI() external view returns (string memory) {
        return _metadata();
    }

    function owner() external pure returns (address) {
        return address(0);
    }

    function _metadata() private view returns (string memory) {
        string memory links = _links();
        return string.concat(
            "data:application/json;utf8,",
            '{"name":"',
            _jsonEscape(name()),
            '","symbol":"',
            _jsonEscape(symbol()),
            '","description":"',
            _jsonEscape(description),
            '","image":"',
            _jsonEscape(logo),
            '"',
            _field("external_url", _socials.website),
            _field("external_link", _socials.website),
            links,
            ',"extensions":{',
            bytes(links).length == 0 ? "" : _stripLeadingComma(links),
            "}}"
        );
    }

    function _links() private view returns (string memory) {
        return string.concat(
            _field("website", _socials.website),
            _field("twitter", _socials.twitter),
            _field("telegram", _socials.telegram),
            _field("discord", _socials.discord),
            _field("farcaster", _socials.farcaster)
        );
    }

    function _field(string memory key, string memory value) private pure returns (string memory) {
        if (bytes(value).length == 0) return "";
        return string.concat(',"', key, '":"', _jsonEscape(value), '"');
    }

    function _stripLeadingComma(string memory s) private pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory out = new bytes(b.length - 1);
        for (uint256 i = 1; i < b.length; ++i) {
            out[i - 1] = b[i];
        }
        return string(out);
    }

    function _jsonEscape(string memory s) private pure returns (string memory) {
        bytes memory b = bytes(s);
        uint256 extra;
        for (uint256 i; i < b.length; ++i) {
            bytes1 c = b[i];
            if (c == '"' || c == "\\" || c == "\n" || c == "\r" || c == "\t") extra += 1;
            else if (uint8(c) < 0x20) extra += 5;
        }
        if (extra == 0) return s;
        bytes memory out = new bytes(b.length + extra);
        bytes16 hexChars = "0123456789abcdef";
        uint256 j;
        for (uint256 i; i < b.length; ++i) {
            bytes1 c = b[i];
            if (c == '"' || c == "\\") {
                out[j++] = "\\";
                out[j++] = c;
            } else if (c == "\n") {
                out[j++] = "\\";
                out[j++] = "n";
            } else if (c == "\r") {
                out[j++] = "\\";
                out[j++] = "r";
            } else if (c == "\t") {
                out[j++] = "\\";
                out[j++] = "t";
            } else if (uint8(c) < 0x20) {
                out[j++] = "\\";
                out[j++] = "u";
                out[j++] = "0";
                out[j++] = "0";
                out[j++] = hexChars[uint8(c) >> 4];
                out[j++] = hexChars[uint8(c) & 0x0f];
            } else {
                out[j++] = c;
            }
        }
        return string(out);
    }
}
