const ConfigurableERC20 = artifacts.require("ConfigurableERC20");
const NFTrade_v2 = artifacts.require("NFTrade_v2");
const EmblemVault = artifacts.require("EmblemVault");
const ERC1155 = artifacts.require("ERC1155")
module.exports = async function(deployer) {
  await deployer.deploy(EmblemVault)
  let instance = await deployer.deploy(ConfigurableERC20)
  deployer.deploy(NFTrade_v2, ConfigurableERC20.address, "0x102e5f644e6ed79ee2a3c221fe16d8711f028952")
  deployer.deploy(ERC1155, "http://foo.bar")
};
