import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedGhostNet = await deploy("GhostNet", {
    from: deployer,
    log: true,
  });

  console.log(`GhostNet contract: `, deployedGhostNet.address);
};
export default func;
func.id = "deploy_ghostnet"; // id required to prevent reexecution
func.tags = ["GhostNet"];
