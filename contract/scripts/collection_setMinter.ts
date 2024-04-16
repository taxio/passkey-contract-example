import { ethers } from "hardhat";

async function main() {
  const [owner] = await ethers.getSigners();

  console.log("Owner:", owner.address);

  const collectionAddr = "0xB3C02935EA0AE93Ba789F4fB7b871194c95962E0";
  const minterAddr = "0x1Aca67E8A9CA5069e09A17787A6aabDcbc83985C";

  const collection = await ethers.getContractAt(
    "DemoCollection",
    collectionAddr
  );
  const tx = await collection.setMinter(minterAddr);
  console.log("tx:", tx.hash);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
