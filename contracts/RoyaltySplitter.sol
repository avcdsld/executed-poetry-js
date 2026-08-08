// SPDX-License-Identifier: WTFPL
pragma solidity 0.8.36;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract RoyaltySplitter {
    address public immutable artist;
    address public immutable gallery;
    uint256 public constant ARTIST_BPS = 7500;

    constructor(address artist_, address gallery_) {
        require(artist_ != address(0) && gallery_ != address(0), "zero");
        artist = artist_;
        gallery = gallery_;
    }

    receive() external payable {}

    function releaseETH() external {
        uint256 bal = address(this).balance;
        require(bal > 0, "empty");
        uint256 toGallery = bal * (10000 - ARTIST_BPS) / 10000;
        (bool g, ) = gallery.call{value: toGallery}("");
        require(g, "gallery");
        (bool a, ) = artist.call{value: bal - toGallery}("");
        require(a, "artist");
    }

    function releaseERC20(IERC20 token) external {
        uint256 bal = token.balanceOf(address(this));
        require(bal > 0, "empty");
        uint256 toGallery = bal * (10000 - ARTIST_BPS) / 10000;
        require(token.transfer(gallery, toGallery), "gallery");
        require(token.transfer(artist, bal - toGallery), "artist");
    }
}
