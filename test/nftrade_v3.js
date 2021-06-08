const ConfigurableERC20 = artifacts.require("ConfigurableERC20")
const NFToken = artifacts.require("EmblemVault")
const NFTrade_v2 = artifacts.require("NFTrade_v3")
const ERC1155 = artifacts.require("ERC1155")
// const simple = artifacts.require("simple")
const truffleAssert = require('truffle-assertions')
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:9545'));
let Token, NFT, Trade, NFT2, NFT3

contract('NFTrade_v3', (accounts) => {
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
      assert.equal(user1Nft, 123)
      assert.equal(user2Nft, 456)
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

    it('cannot place offer against erc20', async ()=>{
      await truffleAssert.reverts(Trade.addOffer(NFT.address, 123, Token.address, 456, 1, 1337, fromUser1), 'Not allowed to make offers for erc20')
    })

    it('cannot place offer without approval', async ()=>{
      await truffleAssert.reverts(Trade.addOffer(NFT.address, 123, NFT.address, 456, 1, 1337, fromUser1), 'Handler unable to transfer NFT')
    })
    
    it('cannot offer un-owned token', async ()=>{
      await truffleAssert.reverts(Trade.addOffer(NFT.address, 456, NFT.address, 123, 1, 1337, fromUser1), 'Sender not owner of NFT')
    })

    it('can place offer after approval', async()=>{
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 456, 1, 1337, fromUser1)
      let offer = await Trade.getOffer(NFT.address, 456, 0)
      assert.equal(offer._from, fromUser1.from)
      assert.equal(offer.tokenId, 123)
      assert.equal(offer.token, NFT.address)
    })

    it('cannot add erc20 token offer when canOfferERC20 off', async ()=>{
      Token.mint(fromUser1.from, 10000000000000, fromOwner)
      await truffleAssert.fails(Trade.addOffer(Token.address, 0, NFT.address, 456, 1, 1337, fromUser1))
    })

    it('cannot add erc20 token offer before allowance', async ()=>{
      Trade.toggleCanOfferERC20(1337, fromOwner)
      Token.mint(fromUser1.from, 10000000000000, fromOwner)
      await truffleAssert.reverts(Trade.addOffer(Token.address, 0, NFT.address, 456, 1, 1337, fromUser1), 'Not Enough Allowance')
    })

    it('can add erc20 token offer after allowance', async ()=>{
      await Trade.toggleCanOfferERC20(1337, fromOwner)
      await Token.mint(fromUser1.from, 10000000000000, fromOwner)
      await Token.approve(Trade.address, 100, fromUser1)
      await truffleAssert.passes(Trade.addOffer(Token.address, 0, NFT.address, 456, 1, 1337, fromUser1))
    })

    it('can withdraw offer', async ()=>{
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      await Trade.addOffer(NFT.address, 123, NFT.address, 456, 1, 1337, fromUser1)
      await truffleAssert.passes(Trade.withdrawOffer(NFT.address, 456, 0, fromUser1))
      let offer = await Trade.getOffer(NFT.address, 456, 0)
      assert.equal(offer._from, '0x0000000000000000000000000000000000000000')
      assert.equal(offer.tokenId, 0)
      assert.equal(offer.token, '0x0000000000000000000000000000000000000000')
    })

    it('rejecting another users offer fails', async ()=>{
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 456, 1, 1337, fromUser1)
      await truffleAssert.reverts(Trade.rejectOffer(NFT.address, 456, 0, fromUser1), 'Sender is not owner of NFT')
    })

    it('can reject offer', async ()=>{
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      await Trade.addOffer(NFT.address, 123, NFT.address, 456, 1, 1337, fromUser1)
      let offer = await Trade.getOffer(NFT.address, 456, 0)
      assert.equal(offer._from, fromUser1.from)
      assert.equal(offer.tokenId, 123)
      assert.equal(offer.token, NFT.address)
      await truffleAssert.passes(Trade.rejectOffer(NFT.address, 456, 0, fromUser2))
      offer = await Trade.getOffer(NFT.address, 456, 0)
      assert.equal(offer._from, '0x0000000000000000000000000000000000000000')
      assert.equal(offer.tokenId, 0)
      assert.equal(offer.token, '0x0000000000000000000000000000000000000000')
    })

    it('cannot accept offer without approval', async ()=>{
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 456, 1, 1337, fromUser1)
      await truffleAssert.reverts(Trade.acceptOffer(NFT.address, 456, 0, 1337, fromUser2), 'Handler unable to transfer NFT')
    })

    it('cannot accept erc20 offer without approval', async ()=>{
      Trade.toggleCanOfferERC20(1337, fromOwner)
      Token.mint(fromUser1.from, 10000000000000, fromOwner)
      Token.approve(Trade.address, 100, fromUser1)
      await Trade.addOffer(Token.address, 0, NFT.address, 789, 1, 1337, fromUser1)
      await truffleAssert.reverts(Trade.acceptOffer(NFT.address, 789, 0, 1337, fromUser3), 'Handler unable to transfer NFT')
    })

    it('can accept erc20 offer with approval', async ()=>{
      Trade.toggleCanOfferERC20(1337, fromOwner)
      Token.mint(fromUser1.from, 10000000000000, fromOwner)
      Token.approve(Trade.address, 100, fromUser1)
      Trade.addOffer(Token.address, 0, NFT.address, 789, 1, 1337, fromUser1)
      NFT.setApprovalForAll(Trade.address, true, fromUser3)
      await Trade.acceptOffer(NFT.address, 789, 0, 1337, fromUser3)
      let balance = await Token.balanceOf(fromUser3.from)
      assert.equal(balance.toNumber(), 1)
      let owner = await NFT.ownerOf(789)
      assert.equal(owner, fromUser1.from)
    })

    it('can withdraw erc20 offer', async ()=>{
      Trade.toggleCanOfferERC20(1337, fromOwner)
      Token.mint(fromUser1.from, 10000000000000, fromOwner)
      Token.approve(Trade.address, 100, fromUser1)
      await Trade.addOffer(Token.address, 0, NFT.address, 789, 1, 1337, fromUser1)
      let offer = await Trade.getOffer(NFT.address, 789, 0)
      assert.equal(offer._from, fromUser1.from)
      assert.equal(offer.tokenId, 0)
      assert.equal(offer.token, Token.address)
      await truffleAssert.passes(Trade.withdrawOffer(NFT.address, 789, 0, fromUser1))
      offer = await Trade.getOffer(NFT.address, 789, 0)
      assert.equal(offer._from, '0x0000000000000000000000000000000000000000')
      assert.equal(offer.tokenId, 0)
      assert.equal(offer.token, '0x0000000000000000000000000000000000000000')
    })

    it('can reject erc20 offer', async ()=>{
      Trade.toggleCanOfferERC20(1337, fromOwner)
      Token.mint(fromUser1.from, 10000000000000, fromOwner)
      Token.approve(Trade.address, 100, fromUser1)
      await Trade.addOffer(Token.address, 0, NFT.address, 789, 1, 1337, fromUser1)
      let offer = await Trade.getOffer(NFT.address, 789, 0)
      assert.equal(offer._from, fromUser1.from)
      assert.equal(offer.tokenId, 0)
      assert.equal(offer.token, Token.address)
      await truffleAssert.passes(Trade.rejectOffer(NFT.address, 789, 0, fromUser3))
      offer = await Trade.getOffer(NFT.address, 789, 0)
      assert.equal(offer._from, '0x0000000000000000000000000000000000000000')
      assert.equal(offer.tokenId, 0)
      assert.equal(offer.token, '0x0000000000000000000000000000000000000000')
    })

    it('can accept offer after approval', async ()=>{
      assert.equal(await NFT.ownerOf(123), fromUser1.from)
      assert.equal(await NFT.ownerOf(456), fromUser2.from)
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      await Trade.addOffer(NFT.address, 123, NFT.address, 456, 1, 1337, fromUser1)
      NFT.setApprovalForAll(Trade.address, true, fromUser2)
      await truffleAssert.passes(Trade.acceptOffer(NFT.address, 456, 0, 1337, fromUser2))
      assert.equal(await NFT.ownerOf(123), fromUser2.from)
      assert.equal(await NFT.ownerOf(456), fromUser1.from)
    })

    it('cannot accept offer for un-owned nft', async ()=>{
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 456, 1, 1337, fromUser1)
      NFT.setApprovalForAll(Trade.address, true, fromUser3)
      await truffleAssert.fails(Trade.acceptOffer(NFT.address, 456, 0, 1337, fromUser3), 'Sender is not owner of NFT')
    })

    it('accepting offer removes all other offers', async ()=>{
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      NFT.setApprovalForAll(Trade.address, true, fromUser2)
      NFT.setApprovalForAll(Trade.address, true, fromUser3)

      await Trade.addOffer(NFT.address, 123, NFT.address, 456, 1, 1337, fromUser1)
      await Trade.addOffer(NFT.address, 789, NFT.address, 456, 1, 1337, fromUser3)

      let count = await Trade.getOfferCount(NFT.address, 456)
      assert.equal(count, 2)

      await truffleAssert.passes(Trade.acceptOffer(NFT.address, 456, 1, 1337, fromUser2))
      assert.equal(await NFT.ownerOf(789), fromUser2.from)
      assert.equal(await NFT.ownerOf(456), fromUser3.from)

      count = await Trade.getOfferCount(NFT.address, 456)
      assert.equal(count, 0)
    })

    it('can get outstanding offers placed', async ()=>{
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 456, 1, 1337, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 789, 1, 1337, fromUser1)
      let offered = await Trade.getOffered(NFT.address, 123, fromUser1)
      assert.equal(offered[0].tokenId, '456')
      assert.equal(offered[1].tokenId, '789')
    })

    it('can get accepted offer for nft ', async ()=>{
      NFT.setApprovalForAll(Trade.address, true, fromUser2)
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 456, 1, 1337, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 789, 1, 1337, fromUser1)

      truffleAssert.passes(Trade.acceptOffer(NFT.address, 456, 0, 1337, fromUser2))

      let accepted = await Trade.getAcceptedOffers(NFT.address, 456)
      assert.equal(accepted[0].tokenId, '123')
    })

    it('accepting offer removes all outstanding offers for nft', async ()=>{
      NFT.setApprovalForAll(Trade.address, true, fromUser2)
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 456, 1, 1337, fromUser1)
      Trade.addOffer(NFT.address, 123, NFT.address, 789, 1, 1337, fromUser1)

      truffleAssert.passes(Trade.acceptOffer(NFT.address, 456, 0, 1337, fromUser2))

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
      Trade.togglePayToMakeOffer(1337, fromOwner)
      Trade.togglePayToAcceptOffer(1337, fromOwner)
      Trade.changeOfferPrices(1000000000, 10000000000, 0, 1337, fromOwner)
    })

    it('reflects correct token balances before trades', async ()=>{ 
      assert.equal((await Token.balanceOf(fromUser1.from)).toNumber(), 10000000000000)
      assert.equal((await Token.balanceOf(fromUser2.from)).toNumber(), 10000000000000)
      assert.equal((await Token.balanceOf(fromBank.from)).toNumber(), 0)
    })

    it('toggles pay to make and accept offers', async ()=>{
      let config = await Trade.getConfig(1337)
      assert.isTrue(config.payToMakeOffer)
      assert.isTrue(config.payToAcceptOffer)
    })

    it('can charge separate prices to make and accept offers', async ()=>{
      let config = await Trade.getConfig(1337)
      assert.equal(config.makeOfferPrice, 1000000000)
      assert.equal(config.acceptOfferPrice, 10000000000)
    })

    describe('Pay to make offer', ()=>{
      it('fails to add offer if trade contract not approved to spend', async ()=>{
        await truffleAssert.reverts(Trade.addOffer(NFT.address, 123, NFT.address, 456, 1, 1337, fromUser1))
      })

      it('fails to add offer if too broke', async ()=>{
        Token.transfer(fromUser2.from, 10000000000000, fromUser1)
        Token.approve(Trade.address, 10000000000000, fromUser1)
        await truffleAssert.reverts(Trade.addOffer(NFT.address, 123, NFT.address, 456, 1, 1337, fromUser1), 'Insufficient Balance for payment')
      })

      it('can make offer', async()=>{
        Token.approve(Trade.address, 10000000000, fromUser1)
        await truffleAssert.passes(Trade.addOffer(NFT.address, 123, NFT.address, 456, 1, 1337, fromUser1))
      })

      it('bank receives fee', async () => {
        assert.equal((await Token.balanceOf(fromBank.from)).toNumber(), 0)
        Token.approve(Trade.address, 10000000000, fromUser1)
        Trade.addOffer(NFT.address, 123, NFT.address, 456, 1, 1337, fromUser1)
        let config = await Trade.getConfig(1337)
        assert.equal((await Token.balanceOf(config.recipientAddress)).toNumber(), 1000000000)
      })
    })

    describe('Pay to accept offer', ()=>{

      beforeEach(()=>{
        Token.approve(Trade.address, 10000000000, fromUser1)
        Trade.addOffer(NFT.address, 123, NFT.address, 456, 1, 1337, fromUser1)
      })

      it('fails to accept offer if trade contract not approved to spend', async () => {
        await truffleAssert.reverts(Trade.acceptOffer(NFT.address, 456, 0, 1337, fromUser2))
      })

      it('fails to accept offer if too broke', async ()=>{
        Token.approve(Trade.address, 10000000000000, fromUser2)
        Token.transfer(fromUser1.from, 10000000000000, fromUser2)
        await truffleAssert.reverts(Trade.acceptOffer(NFT.address, 456, 0, 1337, fromUser2), 'Insufficient Balance for payment')
      })

      it('can accept offer', async ()=>{
        Trade.changeOfferPrices(10, 100, 0, 1337, fromOwner)
        Token.approve(Trade.address, 1000, fromUser2)
        await truffleAssert.passes(Trade.acceptOffer(NFT.address, 456, 0, 1337, fromUser2))
      })

      it('bank receives fee', async ()=>{
        Trade.changeOfferPrices(10, 100, 0, 1337, fromOwner)
        let config = await Trade.getConfig(1337)
        let previousBalance = (await Token.balanceOf(config.recipientAddress)).toNumber()
        Token.approve(Trade.address, 1000, fromUser2)
        await truffleAssert.passes(Trade.acceptOffer(NFT.address, 456, 0, 1337, fromUser2))
        
        let newBalance = (await Token.balanceOf(config.recipientAddress)).toNumber()
        assert.equal(newBalance, previousBalance + 100)
      })
    })
  })
  describe('Trade Types', ()=>{
    beforeEach(()=>{
      NFT3.safeTransferFrom(fromOwner.from, fromUser3.from, 789, 2, 0x0)
      NFT3.safeTransferFrom(fromOwner.from, fromUser4.from, 1337, 1, 0x0)
      NFT.mint(fromUser1.from, 123, 'a', 'b', fromOwner)
      NFT2.mint(fromUser2.from, 456, 'a', 'b', fromOwner)

      Trade.toggleCanOfferERC20(1337, fromOwner)
      Token.mint(fromUser1.from, 10000000000000, fromOwner)
      Token.approve(Trade.address, 100, fromUser1)
      
      NFT.setApprovalForAll(Trade.address, true, fromUser1)
      NFT2.setApprovalForAll(Trade.address, true, fromUser2)
      NFT3.setApprovalForAll(Trade.address, true, fromUser3)
      NFT3.setApprovalForAll(Trade.address, true, fromUser4)
      Trade.addOffer(NFT.address, 123, NFT2.address, 456, 1, 1337, fromUser1)
      Trade.addOffer(NFT2.address, 456, NFT3.address, 789, 1, 1337, fromUser2)
      Trade.addOffer(NFT3.address, 1337, NFT3.address, 789, 1, 1337, fromUser4)
      Trade.addOffer(Token.address, 0, NFT2.address, 456, 1, 1337, fromUser1)
      Trade.addOffer(Token.address, 0, NFT3.address, 789, 1, 1337, fromUser1)
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
      assert.equal(user3Nft.toNumber(), 2)
      assert.equal(user4Nft.toNumber(), 1)
    })

    it('can swap erc721 for erc721', async ()=>{
      await Trade.acceptOffer(NFT2.address, 456, 0, 1337, fromUser2)
      let user1Nft = await NFT2.tokenOfOwnerByIndex(fromUser1.from, 0)
      let user2Nft = await NFT.tokenOfOwnerByIndex(fromUser2.from, 0)
      assert.equal(user1Nft.toNumber(), 456)
      assert.equal(user2Nft.toNumber(), 123)
    })

    it('can detect erc1155 vs erc721 vs erc20', async ()=>{
      assert.isTrue(await Trade.checkInterface(NFT3.address, '0xd9b67a26'))
      assert.isTrue(await Trade.checkInterface(NFT.address, '0x80ac58cd'))
      assert.isTrue(await Trade.checkInterface(Token.address, '0x74a1476f'))
    })

    it('can swap erc721 for erc1155', async ()=>{
      await Trade.acceptOffer(NFT3.address, 789, 0, 1337, fromUser3)
      let user2Nft = await NFT3.balanceOf(fromUser2.from, 789)
      let user3Nft = await NFT2.tokenOfOwnerByIndex(fromUser3.from, 0)
      assert.equal(user2Nft.toNumber(), 1)
      assert.equal(user3Nft.toNumber(), 456)
    })

    it('can swap erc1155 for erc1155', async ()=>{
      await Trade.acceptOffer(NFT3.address, 789, 1, 1337, fromUser3)
      let user3Nft = await NFT3.balanceOf(fromUser3.from, 1337)
      let user4Nft = await NFT3.balanceOf(fromUser4.from, 789)
      assert.equal(user3Nft.toNumber(), 1)
      assert.equal(user4Nft.toNumber(), 1)
    })

    it('can swap erc20 for erc721', async ()=>{
      let balanceOfErc20 = await Token.balanceOf(fromUser2.from)
      let ownerOfERC721 = await NFT2.ownerOf(456)
      assert.equal(balanceOfErc20.toNumber(), 0)
      assert.equal(ownerOfERC721, fromUser2.from)
      await Trade.acceptOffer(NFT2.address, 456, 1, 1337, fromUser2)
      balanceOfErc20 = await Token.balanceOf(fromUser2.from)
      ownerOfERC721 = await NFT2.ownerOf(456)
      assert.equal(balanceOfErc20.toNumber(), 1)
      assert.equal(ownerOfERC721, fromUser1.from)
    })

    it('can swap erc20 for erc1155', async ()=>{
      let balanceOfErc20 = await Token.balanceOf(fromUser3.from)
      let balanceOfERC1155 = await NFT3.balanceOf(fromUser3.from, 789)
      assert.equal(balanceOfErc20.toNumber(), 0)
      assert.equal(balanceOfERC1155, 2)
      await Trade.acceptOffer(NFT3.address, 789, 2, 1337, fromUser3)
      balanceOfErc20 = await Token.balanceOf(fromUser3.from)
      balanceOfERC1155 = await NFT3.balanceOf(fromUser1.from, 789)
      assert.equal(balanceOfErc20.toNumber(), 1)
      assert.equal(balanceOfERC1155, 1)
    })

  })
  describe('Percentage', ()=>{
    it('can calculate percentage of even', async()=>{
      let total = await Trade.fromPercent(100, 10)
      assert.equal(total.toNumber(), 10)
    })
    it('can calculate percentage of odd', async()=>{
      let total = await Trade.fromPercent(105, 10)
      assert.equal(total.toNumber(), 10)
    })
    it('can calculate 100%', async()=>{
      let total = await Trade.fromPercent(105, 100)
      assert.equal(total.toNumber(), 105)
    })
    it('can calculate 0%', async()=>{
      let total = await Trade.fromPercent(105, 0)
      assert.equal(total.toNumber(), 0)
    })
    it('can calculate % of single', async()=>{
      let total = await Trade.fromPercent(1, 10)
      assert.equal(total.toNumber(), 0)
    })
    it('fails on attempt to calculate negative', async()=>{
      await truffleAssert.fails(Trade.fromPercent(-105, 10))
    })
    describe('percentage fee for erc20 offer', async()=>{
      beforeEach(()=>{
        NFT.mint(fromUser2.from, 456, 'a', 'b', fromOwner)
  
        Trade.toggleCanOfferERC20(1337, fromOwner)
        Trade.toggleTakePercentageOfERC20(1337, fromOwner)
        Trade.changeOfferPrices(0, 0, 10, 1337, fromOwner)

        Token.mint(fromUser1.from, 10000000000000, fromOwner)
        Token.approve(Trade.address, 1000, fromUser1)
        
        NFT.setApprovalForAll(Trade.address, true, fromUser2)

        Trade.addOffer(Token.address, 0, NFT.address, 456, 10, 1337, fromUser1)
        
      })

      it('Percentage fees are paid when percentage fee for erc20 on', async ()=>{
        let balanceOfErc20 = await Token.balanceOf(fromUser2.from)
        let ownerOfERC721 = await NFT.ownerOf(456)
        let config = await Trade.getConfig(1337)
        assert.equal((await Token.balanceOf(config.recipientAddress)).toNumber(), 0)
        assert.equal(balanceOfErc20.toNumber(), 0)
        assert.equal(ownerOfERC721, fromUser2.from)
        await Trade.acceptOffer(NFT.address, 456, 0, 1337, fromUser2)
        balanceOfErc20 = await Token.balanceOf(fromUser2.from)
        ownerOfERC721 = await NFT.ownerOf(456)
        assert.equal(balanceOfErc20.toNumber(), 9)
        assert.equal(ownerOfERC721, fromUser1.from)
        assert.equal((await Token.balanceOf(config.recipientAddress)).toNumber(), 1)
      })

      it('Percentage fees are not paid when percentage fee for erc20 off', async ()=>{
        Trade.toggleTakePercentageOfERC20(1337, fromOwner)
        let balanceOfErc20 = await Token.balanceOf(fromUser2.from)
        let ownerOfERC721 = await NFT.ownerOf(456)
        let config = await Trade.getConfig(1337)
        assert.equal((await Token.balanceOf(config.recipientAddress)).toNumber(), 0)
        assert.equal(balanceOfErc20.toNumber(), 0)
        assert.equal(ownerOfERC721, fromUser2.from)
        await Trade.acceptOffer(NFT.address, 456, 0, 1337, fromUser2)
        balanceOfErc20 = await Token.balanceOf(fromUser2.from)
        ownerOfERC721 = await NFT.ownerOf(456)
        assert.equal(balanceOfErc20.toNumber(), 10)
        assert.equal(ownerOfERC721, fromUser1.from)
        assert.equal((await Token.balanceOf(config.recipientAddress)).toNumber(), 0)
      })
    })
  })
})
