import { ethers } from "hardhat";

async function main() {
  const [owner] = await ethers.getSigners();

  console.log("Owner:", owner.address);

  const collectionAddr = "0xA6392490B9C274b0f85b31B94E521deDe67071F6";
  const minterAddr = "0xc460E826d8852207Da692B4945504bEFF839Ec4c";

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
