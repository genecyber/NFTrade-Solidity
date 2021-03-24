// SPDX-License-Identifier: MIT

pragma experimental ABIEncoderV2;
pragma solidity ^0.6.12;


interface IERC20Token {
    function transfer(address to, uint256 value) external returns (bool);
    function approve(address spender, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function totalSupply() external view returns (uint256);
    function balanceOf(address who) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

interface IERC721 {
    function burn(uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
    function mint( address _to, uint256 _tokenId, string calldata _uri, string calldata _payload) external;
    function ownerOf(uint256 _tokenId) external returns (address _owner);
    function getApproved(uint256 _tokenId) external returns (address);
    function safeTransferFrom(address _from, address _to, uint256 _tokenId) external;
    function isApprovedForAll(address _owner, address _operator) external returns (bool);
    function balanceOf(address account, uint256 id) external view returns (uint256);
}

interface IERC1155 {
    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external;
}

interface BasicERC20 {
    function burn(uint256 value) external;
    function mint(address account, uint256 amount) external;
    function decimals() external view returns (uint8);
}

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

contract NFTrade_v2 {
    
    address resolver;
    
    address payable private owner;
    bool public initialized;
    address public paymentAddress = address(this);
    address public recipientAddress;
    uint256 public makeOfferPrice = 0;
    uint256 public acceptOfferPrice = 0;
    bool public payToAcceptOffer = false;
    bool public payToMakeOffer = false;
    bool public locked = false;
    bytes4 private constant _INTERFACE_ID_ERC1155 = 0xd9b67a26;
    
    struct Offer {
        uint tokenId;
        address _from;
        address nft;
    }
    
    // event for EVM logging
    event OwnerSet(address indexed oldOwner, address indexed newOwner);
    
    mapping(address => mapping(uint => Offer[])) offers;
    mapping(address => mapping(uint => Offer[])) rejected;
    mapping(address => mapping(address => mapping(uint => Offer[]))) offered;
    mapping(address => mapping(uint => Offer[])) accepted;
    
    modifier isOwner() {
        // If the first argument of 'require' evaluates to 'false', execution terminates and all
        // changes to the state and to Ether balances are reverted.
        // This used to consume all gas in old EVM versions, but not anymore.
        // It is often a good idea to use 'require' to check if functions are called correctly.
        // As a second argument, you can also provide an explanation about what went wrong.
        require(msg.sender == owner, "Caller is not owner");
        _;
    }
    
    modifier notLocked() {
        require(!locked, "Contract is locked");
        _;
    }
    
    constructor(address _paymentAddress, address _recipientAddress) public {
        init(_paymentAddress, _recipientAddress);
    }
    
    function init(address _paymentAddress, address _recipientAddress) public {
        require(!initialized, 'Already initialized');
        initialized = true;
        owner = msg.sender; // 'msg.sender' is sender of current call, contract deployer for a constructor
        emit OwnerSet(address(0), owner);
        paymentAddress = _paymentAddress;
        recipientAddress = _recipientAddress;
    }
    
    function getVersion() public pure returns (uint) {
        return 1;
    }
    
    /**
     * @dev Change owner
     * @param newOwner address of new owner
     */
    function transferOwnership(address payable newOwner) public isOwner {
        emit OwnerSet(owner, newOwner);
        owner = newOwner;
    }
    
    /**
     * @dev Return owner address 
     * @return address of owner
     */
    function getOwner() external view returns (address) {
        return owner;
    }
    
    function acceptOffer(address _nft, uint _tokenId, uint index) public notLocked {
        Offer memory _offer = offers[_nft][_tokenId][index];
        IERC721 nftToken1 = IERC721(_nft);
        IERC721 nftToken2 = IERC721(_offer.nft);
        if (checkInterface(_nft, _INTERFACE_ID_ERC1155)){
            require(nftToken1.balanceOf(msg.sender, _tokenId) > 0, 'Sender is not owner of NFT');
        } else {
            require(nftToken1.ownerOf(_tokenId) == msg.sender,'Sender is not owner of NFT');
        }

        require(nftToken1.isApprovedForAll(msg.sender, address(this)), 'Handler unable to transfer NFT');

        if (checkInterface(_offer.nft, _INTERFACE_ID_ERC1155)){
            require(nftToken2.balanceOf(_offer._from, _offer.tokenId) > 0, 'NFT not owned by offerer');
        } else {
            require(nftToken2.ownerOf(_offer.tokenId) == _offer._from, 'NFT not owned by offerer');
        }
        
        require(nftToken2.isApprovedForAll(_offer._from, address(this)), 'Handler unable to transfer offer NFT');
        
        if (acceptOfferPrice > 0 && payToAcceptOffer) {
            IERC20Token paymentToken = IERC20Token(paymentAddress);
            require(paymentToken.allowance(msg.sender, address(this)) >= acceptOfferPrice, 'Handler unable take payment for offer');
            require(paymentToken.balanceOf(msg.sender) >= acceptOfferPrice, 'Insufficient Balance for payment');
            require(paymentToken.transferFrom(msg.sender, address(recipientAddress), acceptOfferPrice), 'Payment error');
        }

        if (checkInterface(_offer.nft, _INTERFACE_ID_ERC1155)){
            IERC1155(_offer.nft).safeTransferFrom(_offer._from, msg.sender, _offer.tokenId, 1, "");
        } else {
            nftToken2.safeTransferFrom(_offer._from, msg.sender, _offer.tokenId);
        }

        if (checkInterface(_nft, _INTERFACE_ID_ERC1155)){
            IERC1155(_nft).safeTransferFrom(msg.sender, _offer._from, _tokenId, 1, "");
        } else {
            nftToken1.safeTransferFrom(msg.sender, _offer._from, _tokenId);
        }
        
        delete offers[_nft][_tokenId];
        delete offered[_offer.nft][_offer._from][_offer.tokenId];
        accepted[_nft][_tokenId].push(_offer);
    }
    
    event OfferAdded(address _nft, uint256 _tokenId, address _forNft, uint256 _for);
    function addOffer(address _nft, uint256 _tokenId, address _forNft, uint256 _for) public notLocked {
        IERC721 nftToken1 = IERC721(_nft);
        IERC20Token paymentToken = IERC20Token(paymentAddress);

        if (checkInterface(_nft, _INTERFACE_ID_ERC1155)){
            require(nftToken1.balanceOf(msg.sender, _tokenId) > 0, 'NFT not owned by offerer');
        } else {
            require(nftToken1.ownerOf(_tokenId) == msg.sender, 'Sender not owner of NFT');
        }

        require(nftToken1.isApprovedForAll(msg.sender, address(this)), 'Handler unable to transfer NFT');
        
        if (makeOfferPrice > 0 && payToMakeOffer) {
            require(paymentToken.allowance(msg.sender, address(this)) >= makeOfferPrice, 'Handler unable take payment for offer');
            require(paymentToken.balanceOf(msg.sender) >= makeOfferPrice, 'Insufficient Balance for payment');
            require(paymentToken.transferFrom(msg.sender, address(recipientAddress), makeOfferPrice), 'Payment error');
            emit OfferAdded(_nft, _tokenId, _forNft, _for);
        }
        offers[_forNft][_for].push(Offer(_tokenId, msg.sender, _nft));
        offered[_nft][msg.sender][_tokenId].push(Offer(_for, msg.sender, _forNft));
    }
    
    function rejectOffer(address _nft, uint256 _tokenId, uint index) public notLocked {
        Offer memory _offer = offers[_nft][_tokenId][index];
        IERC721 nftToken = IERC721(_nft);
        if (checkInterface(_nft, _INTERFACE_ID_ERC1155)){
            require(nftToken.balanceOf(msg.sender, _tokenId) > 0, 'NFT not owned by offerer');
        } else {
            require(nftToken.ownerOf(_tokenId) == msg.sender,'Sender is not owner of NFT');
        }

        rejected[_nft][_tokenId].push(_offer);
        delete offers[_nft][_tokenId][index];
        delete offered[_offer.nft][_offer._from][_offer.tokenId];
    }
    
    function withdrawOffer(address _nft, uint256 _tokenId, uint index) public notLocked {
        Offer memory _offer = offers[_nft][_tokenId][index];
        IERC721 nftToken = IERC721(_nft);
        if (checkInterface(_nft, _INTERFACE_ID_ERC1155)){
            require(nftToken.balanceOf(msg.sender, _offer.tokenId) > 0, 'NFT not owned by offerer');
        } else {
            require(nftToken.ownerOf(_offer.tokenId) == msg.sender,'Sender is not owner of offer NFT');
        }
        
        delete offers[_nft][_tokenId][index];
        delete offered[_offer.nft][_offer._from][_offer.tokenId];
    }
    
    function togglePayToMakeOffer() public isOwner {
        payToMakeOffer = !payToMakeOffer;
    }
    function togglePayToAcceptOffer() public isOwner {
        payToAcceptOffer = !payToAcceptOffer;
    }
    
    function toggleLocked() public isOwner {
        locked = !locked;
    }
    
    function getOffer(address _nft, uint256 _tokenId, uint index) public view returns (Offer memory) {
        return offers[_nft][_tokenId][index];
    }
    
    function getOffered(address _nft, uint256 _tokenId) public view returns (Offer[] memory) {
        return offered[_nft][msg.sender][_tokenId];
    }
    
    function getOfferCount(address _nft, uint256 _tokenId) public view returns (uint) {
        return offers[_nft][_tokenId].length;
    }
    
    function getAcceptedOffers(address _nft, uint256 _tokenId) public view returns (Offer[] memory) {
        return accepted[_nft][_tokenId];
    }
    
    function getRejectedOffers(address _nft, uint256 _tokenId) public view returns (Offer[] memory) {
        return rejected[_nft][_tokenId];
    }
    
    function changeOfferPrices(uint256 _makeOfferPrice, uint256 _acceptOfferPrice) public isOwner {
        makeOfferPrice = _makeOfferPrice;
        acceptOfferPrice = _acceptOfferPrice;
    }
    
    function changeRecipientAddress(address _recipientAddress) public isOwner {
       recipientAddress = _recipientAddress;
    }

    function checkInterface(address _nft, bytes4 _interface) public view returns (bool) {
        IERC165 nftToken = IERC165(_nft);
        return nftToken.supportsInterface(_interface);
    }
}

library SafeMath {
    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a + b;
        require(c >= a, "SafeMath: addition overflow");

        return c;
    }

    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        return sub(a, b, "SafeMath: subtraction overflow");
    }

    function sub(
        uint256 a,
        uint256 b,
        string memory errorMessage
    ) internal pure returns (uint256) {
        require(b <= a, errorMessage);
        uint256 c = a - b;

        return c;
    }

    function mul(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a == 0) {
            return 0;
        }

        uint256 c = a * b;
        require(c / a == b, "SafeMath: multiplication overflow");

        return c;
    }

    function div(uint256 a, uint256 b) internal pure returns (uint256) {
        return div(a, b, "SafeMath: division by zero");
    }

    function div(
        uint256 a,
        uint256 b,
        string memory errorMessage
    ) internal pure returns (uint256) {
        // Solidity only automatically asserts when dividing by 0
        require(b > 0, errorMessage);
        uint256 c = a / b;

        return c;
    }
}