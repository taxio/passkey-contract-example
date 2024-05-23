// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract DemoCollection is ERC1155, Ownable {
    address public minter;

    constructor(string memory uri) Ownable(msg.sender) ERC1155(uri) {}

    modifier onlyMinter() {
        require(msg.sender == minter, "Only minter can call this.");
        _;
    }

    function setMinter(address _minter) external onlyOwner {
        minter = _minter;
    }

    function mint(address account) public onlyMinter {
        _mint(account, 1, 1, "0x");
    }
}
