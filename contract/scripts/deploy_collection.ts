import { ethers } from "hardhat";

async function main() {
  const [owner] = await ethers.getSigners();

  console.log("Owner:", owner.address);

  const Collection = await ethers.getContractFactory("DemoCollection");
  const collection = await Collection.deploy(
    "https://gist.githubusercontent.com/taxio/11583d428a2515f94663a04aa914f9eb/raw/a2db78104747365fd6d7501ed742627940a9a2d7/{id}.json"
  );
  console.log("deploy tx:", collection.deploymentTransaction()?.hash);
  console.log("deploy address:", await collection.getAddress());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
