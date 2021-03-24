const ConfigurableERC20 = artifacts.require("ConfigurableERC20")
const NFToken = artifacts.require("EmblemVault")
const NFTrade_v2 = artifacts.require("NFTrade_v2")
const ERC1155 = artifacts.require("ERC1155")
// const simple = artifacts.require("simple")
const truffleAssert = require('truffle-assertions')
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:9545'));
let Token, NFT, Trade, NFT2, NFT3
async function getToken() {
  return await ConfigurableERC20.deployed()
}
// async function getSimpleToken() {
//   return await simple.deployed()
// }

contract('NFTrade', (accounts) => {
  const fromOwner = { from: accounts[0] }
  const fromUser1 = { from: accounts[1] }
  const fromUser2 = { from: accounts[2] }
  const fromUser3 = { from: accounts[3] }
  const fromUser4 = { from: accounts[4] }
  const fromBank = { from: "0x102e5f644e6ed79ee2a3c221fe16d8711f028952" }

  beforeEach(async () => {
    Token = await ConfigurableERC20.new();
    NFT = await NFToken.new();
    NFT2 = await NFToken.new();
    NFT3 = await ERC1155.new("abc");
    await NFT2.changeName("Other NFT", "other.nft");
    Trade = await NFTrade_v2.new(Token.address, fromBank.from);
  });
  
  describe('NFT', ()=>{

    it('has correct name', async () => {
      let name = await NFT.name()
      assert.equal(name, "Emblem Vault V2")
    })

    it('can mint', async ()=>{
      await NFT.mint(fromUser1.from, 123, 'a', 'b', fromOwner)
      await NFT.mint(fromUser2.from, 456, 'a', 'b', fromOwner)
      let totalSupply = await NFT.totalSupply()
      assert.equal(totalSupply, 2)
    })

    it('users have expected balances', async()=>{
      await NFT.mint(fromUser1.from, 123, 'a', 'b', fromOwner)
      await NFT.mint(fromUser2.from, 456, 'a', 'b', fromOwner)
      let user1Nft = await NFT.tokenOfOwnerByIndex(fromUser1.from, 0)
      let user2Nft = await NFT.tokenOfOwnerByIndex(fromUser2.from, 0)
      assert(user1Nft, 123)
      assert(user2Nft, 456)
    })
  })
  describe('Trade', ()=>{

    beforeEach(async ()=>{
      await NFT.mint(fromUser1.from, 123, 'a', 'b', fromOwner)
      await NFT.mint(fromUser2.from, 456, 'a', 'b', fromOwner)
      await NFT.mint(fromUser3.from, 789, 'a', 'b', fromOwner)
    })

    it('reflects correct version', async ()=>{
      let version = await Trade.getVersion()
      assert.equal(version, 1)
    })

    it('cannot place offer without approval', async ()=>{
      await truffleAssert.fails(Trade.addOffer(NFT.address, 123, NFT.address, 456, fromUser1))
    })
    it('cannot offer un-owned token', async ()=>{
      await truffleAssert.fails(Trade.addOffer(NFT.address, 456, NFT.address, 123, fromUser1))
    })
    it('can place offer after approval', async()=>{
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 456, fromUser1)
      let offer = await Trade.getOffer(NFT.address, 456, 0)
      assert(offer._from, fromUser1.from)
      assert(offer.tokenId, 123)
      assert(offer.nft, NFT.address)
    })
    it('can withdraw offer', async ()=>{
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 456, fromUser1)
      truffleAssert.passes(Trade.withdrawOffer(NFT.address, 456, 0, fromUser1))
      let offer = await Trade.getOffer(NFT.address, 456, 0)
      assert(offer._from, '0x0000000000000000000000000000000000000000')
      assert(offer.tokenId, 0)
      assert(offer.nft, '0x0000000000000000000000000000000000000000')
    })
    it('rejecting another users offer fails', async ()=>{
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 456, fromUser1)
      truffleAssert.fails(Trade.rejectOffer(NFT.address, 456, 0, fromUser1))
    })
    it('can reject offer', async ()=>{
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 456, fromUser1)
      truffleAssert.passes(Trade.rejectOffer(NFT.address, 456, 0, fromUser2))
      let count = await Trade.getOfferCount(NFT.address, 456)
      assert(count, 0)
    })
    it('cannot accept offer without approval', async ()=>{
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 456, fromUser1)
      truffleAssert.fails(Trade.acceptOffer(NFT.address, 456, 0, fromUser2))
    })
    it('can accept offer after approval', async ()=>{
      assert(await NFT.ownerOf(123), fromUser1.from)
      assert(await NFT.ownerOf(456), fromUser2.from)
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 456, fromUser1)
      NFT.setApprovalForAll(Trade.address, true, fromUser2)
      truffleAssert.passes(Trade.acceptOffer(NFT.address, 456, 0, fromUser2))
      assert(await NFT.ownerOf(123), fromUser2.from)
      assert(await NFT.ownerOf(456), fromUser1.from)
    })
    it('cannot accept offer for un-owned nft', async ()=>{
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 456, fromUser1)
      NFT.setApprovalForAll(Trade.address, true, fromUser3)
      truffleAssert.fails(Trade.acceptOffer(NFT.address, 456, 0, fromUser3))
    })
    it('accepting offer removes all other offers', async ()=>{
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      NFT.setApprovalForAll(Trade.address, true, fromUser2)
      NFT.setApprovalForAll(Trade.address, true, fromUser3)

      Trade.addOffer(NFT.address, 123, NFT.address, 456, fromUser1)
      Trade.addOffer(NFT.address, 789, NFT.address, 456, fromUser3)

      let count = await Trade.getOfferCount(NFT.address, 456)
      assert.equal(count, 2)

      truffleAssert.passes(Trade.acceptOffer(NFT.address, 456, 1, fromUser2))
      assert(await NFT.ownerOf(789), fromUser2.from)
      assert(await NFT.ownerOf(456), fromUser3.from)

      count = await Trade.getOfferCount(NFT.address, 456)
      assert.equal(count, 0)
    })
    it('can get outstanding offers placed', async ()=>{
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 456, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 789, fromUser1)
      let offered = await Trade.getOffered(NFT.address, 123, fromUser1)
      assert.equal(offered[0].tokenId, '456')
      assert.equal(offered[1].tokenId, '789')
    })
    it('can get accepted offer for nft ', async ()=>{
      NFT.setApprovalForAll(Trade.address, true, fromUser2)
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 456, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 789, fromUser1)

      truffleAssert.passes(Trade.acceptOffer(NFT.address, 456, 0, fromUser2))

      let accepted = await Trade.getAcceptedOffers(NFT.address, 456)
      assert.equal(accepted[0].tokenId, '123')
    })
    it('accepting offer removes all outstanding offers for nft', async ()=>{
      NFT.setApprovalForAll(Trade.address, true, fromUser2)
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 456, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 789, fromUser1)

      truffleAssert.passes(Trade.acceptOffer(NFT.address, 456, 0, fromUser2))

      let offered = await Trade.getOffered(NFT.address, 123, fromUser1)
      assert.equal(offered.length, 0)
    })
  })
  describe('Payment', ()=>{

    beforeEach(async ()=>{
      NFT.mint(fromUser1.from, 123, 'a', 'b', fromOwner)
      NFT.mint(fromUser2.from, 456, 'a', 'b', fromOwner)
      NFT.setApprovalForAll(Trade.address, true, fromUser2)
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      Token.mint(fromUser1.from, 10000000000000, fromOwner)
      Token.mint(fromUser2.from, 10000000000000, fromOwner)
      Trade.togglePayToMakeOffer(fromOwner)
      Trade.togglePayToAcceptOffer(fromOwner)
      Trade.changeOfferPrices(1000000000, 10000000000, fromOwner)
    })

    it('reflects correct token balances before trades', async ()=>{ 
      assert.equal((await Token.balanceOf(fromUser1.from)).toNumber(), 10000000000000)
      assert.equal((await Token.balanceOf(fromUser2.from)).toNumber(), 10000000000000)
      assert.equal((await Token.balanceOf(fromBank.from)).toNumber(), 0)
    })

    it('toggles pay to make and accept offers', async ()=>{ 
      assert.isTrue(await Trade.payToMakeOffer())
      assert.isTrue(await Trade.payToAcceptOffer())
    })

    it('can charge separate prices to make and accept offers', async ()=>{
      assert.equal((await Trade.makeOfferPrice()).toNumber(), 1000000000)
      assert.equal((await Trade.acceptOfferPrice()).toNumber(), 10000000000)
    })

    describe('Pay to make offer', ()=>{
      it('fails to add offer if trade contract not approved to spend', async ()=>{
        await truffleAssert.reverts(Trade.addOffer(NFT.address, 123, NFT.address, 456, fromUser1))
      })

      it('fails to add offer if too broke', async ()=>{
        Token.transfer(fromUser2.from, 1000000000, fromUser1)
        await truffleAssert.reverts(Trade.addOffer(NFT.address, 123, NFT.address, 456, fromUser1))
      })

      it('can make offer', async()=>{
        Token.approve(Trade.address, 10000000000, fromUser1)
        await truffleAssert.passes(Trade.addOffer(NFT.address, 123, NFT.address, 456, fromUser1))
      })

      // it('deducts correct amount', async ()=>{
      //   assert.equal((await Token.balanceOf(fromUser1.from)).toNumber(), 10000000000000)
      //   Token.approve(Trade.address, 10000000000, fromUser1)
      //   Trade.addOffer(NFT.address, 123, NFT.address, 456, fromUser1)
      //   assert.equal((await Token.balanceOf(fromUser1.from)).toNumber(), 10000000000000 - 1000000000)
      // })

      it('bank receives fee', async () => {
        assert.equal((await Token.balanceOf(fromBank.from)).toNumber(), 0)
        Token.approve(Trade.address, 10000000000, fromUser1)
        Trade.addOffer(NFT.address, 123, NFT.address, 456, fromUser1)
        assert.equal((await Token.balanceOf(await Trade.recipientAddress())).toNumber(), 1000000000)
      })
    })

    describe('Pay to accept offer', ()=>{

      beforeEach(()=>{
        Token.approve(Trade.address, 10000000000, fromUser1)
        Trade.addOffer(NFT.address, 123, NFT.address, 456, fromUser1)
      })

      it('fails to accept offer if trade contract not approved to spend', async () => {
        await truffleAssert.reverts(Trade.acceptOffer(NFT.address, 456, 0, fromUser2))
      })

      it('fails to accept offer if too broke', async ()=>{
        Token.transfer(fromUser1.from, 1000000000, fromUser2)
        await truffleAssert.reverts(Trade.acceptOffer(NFT.address, 456, 0, fromUser2))
      })

      it('can accept offer', async ()=>{
        Trade.changeOfferPrices(10, 100, fromOwner)
        Token.approve(Trade.address, 1000, fromUser2)
        await truffleAssert.passes(Trade.acceptOffer(NFT.address, 456, 0, fromUser2))
      })

      it('bank receives fee', async ()=>{
        Trade.changeOfferPrices(10, 100, fromOwner)
        let previousBalance = (await Token.balanceOf(await Trade.recipientAddress())).toNumber()
        Token.approve(Trade.address, 1000, fromUser2)
        await truffleAssert.passes(Trade.acceptOffer(NFT.address, 456, 0, fromUser2))
        let newBalance = (await Token.balanceOf(await Trade.recipientAddress())).toNumber()
        assert.equal(newBalance, previousBalance + 100)
      })
    })
  })
  describe('NFT Types', ()=>{

    beforeEach(()=>{
      NFT3.safeTransferFrom(fromOwner.from, fromUser3.from, 789, 1, 0x0)
      NFT3.safeTransferFrom(fromOwner.from, fromUser4.from, 1337, 1, 0x0)
      NFT.mint(fromUser1.from, 123, 'a', 'b', fromOwner)
      NFT2.mint(fromUser2.from, 456, 'a', 'b', fromOwner)
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      NFT2.setApprovalForAll(Trade.address, true, fromUser2)
      NFT3.setApprovalForAll(Trade.address, true, fromUser3)
      NFT3.setApprovalForAll(Trade.address, true, fromUser4)
      Trade.addOffer(NFT.address, 123, NFT2.address, 456, fromUser1)
      Trade.addOffer(NFT2.address, 456, NFT3.address, 789, fromUser2)
      Trade.addOffer(NFT3.address, 1337, NFT3.address, 789, fromUser4)
    })

    it('2 separate nft contracts exist', async ()=>{
      assert.equal(await NFT.name(), 'Emblem Vault V2')
      assert.equal(await NFT2.name(), 'Other NFT')      
    })

    it('users have correct balances of nfts before trades', async ()=>{
      let user1Nft = await NFT.tokenOfOwnerByIndex(fromUser1.from, 0)
      let user2Nft = await NFT2.tokenOfOwnerByIndex(fromUser2.from, 0)
      let user3Nft = await NFT3.balanceOf(fromUser3.from, 789)
      let user4Nft = await NFT3.balanceOf(fromUser4.from, 1337)
      assert.equal(user1Nft.toNumber(), 123)
      assert.equal(user2Nft.toNumber(), 456)
      assert.equal(user3Nft.toNumber(), 1)
      assert.equal(user4Nft.toNumber(), 1)
    })

    it('can swap erc721 for erc721', async ()=>{
      await Trade.acceptOffer(NFT2.address, 456, 0, fromUser2)
      let user1Nft = await NFT2.tokenOfOwnerByIndex(fromUser1.from, 0)
      let user2Nft = await NFT.tokenOfOwnerByIndex(fromUser2.from, 0)
      assert.equal(user1Nft.toNumber(), 456)
      assert.equal(user2Nft.toNumber(), 123)
    })

    it('can detect erc1155 vs erc721', async ()=>{
      assert.isTrue(await Trade.checkInterface(NFT3.address, '0xd9b67a26'))
      assert.isFalse(await Trade.checkInterface(NFT.address, '0xd9b67a26'))
    })

    it('can swap erc721 for erc1155', async ()=>{
      await Trade.acceptOffer(NFT3.address, 789, 0, fromUser3)
      let user2Nft = await NFT3.balanceOf(fromUser2.from, 789)
      let user3Nft = await NFT2.tokenOfOwnerByIndex(fromUser3.from, 0)
      assert.equal(user2Nft.toNumber(), 1)
      assert.equal(user3Nft.toNumber(), 456)
    })

    it('can swap erc1155 for erc1155', async ()=>{
      await Trade.acceptOffer(NFT3.address, 789, 1, fromUser3)
      let user3Nft = await NFT3.balanceOf(fromUser3.from, 1337)
      let user4Nft = await NFT3.balanceOf(fromUser4.from, 789)
      assert.equal(user3Nft.toNumber(), 1)
      assert.equal(user4Nft.toNumber(), 1)
    })
  })
})
