// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";

contract Verifier is Ownable, IERC1271 {
    constructor() Ownable(msg.sender) {}

    uint256 _pubKeyX;
    uint256 _pubKeyY;

    function pubKey() public view returns (uint256, uint256) {
        return (_pubKeyX, _pubKeyY);
    }

    function setPubKey(uint256 x, uint256 y) public onlyOwner {
        _pubKeyX = x;
        _pubKeyY = y;
    }

    function isValidSignature(
        bytes32 msgHash,
        bytes memory signature
    ) public view override returns (bytes4) {
        // TODO
        return IERC1271.isValidSignature.selector;
    }
}
