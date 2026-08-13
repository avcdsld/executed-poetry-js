// SPDX-License-Identifier: WTFPL
pragma solidity 0.8.36;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IRuntime.sol";

contract ExecutedPoetry is ERC721, ERC2981, Ownable {
    IRuntime public runtime;

    mapping(uint256 => string) public titles;
    mapping(uint256 => string) public poems;
    uint256 public total;

    mapping(uint256 => uint256) public counts;
    mapping(uint256 => IRuntime.Trace) public executions;

    event Executed(uint256 indexed id, uint32 count, address indexed by, uint256 blockTime, uint32 micros, uint64 unixtime, string env, bytes32 pub, bytes sig);

    constructor(address r, address royaltyReceiver, uint96 royaltyBps) ERC721("Executed Poetry for JavaScript", "POEM") Ownable(msg.sender) {
        runtime = IRuntime(r);
        _setDefaultRoyalty(royaltyReceiver, royaltyBps);
    }

    function setPoems(string[] calldata t, string[] calldata p) external onlyOwner {
        require(t.length == p.length, "length");
        total = t.length;
        for (uint256 i = 0; i < total; i++) {
            titles[i] = t[i];
            poems[i] = p[i];
        }
    }

    function setRuntime(address r) external onlyOwner {
        runtime = IRuntime(r);
    }

    function setDefaultRoyalty(address receiver, uint96 bps) external onlyOwner {
        _setDefaultRoyalty(receiver, bps);
    }

    function mint(address to, uint256 id) external onlyOwner {
        require(id < total, "unknown");
        _mint(to, id);
    }

    function record(uint256 id, uint32 count, uint32 micros, uint64 unixtime, string calldata env, bytes32 pub, bytes calldata sig) external {
        require(id < total, "unknown");
        require(sig.length == 64, "sig");
        require(bytes(env).length <= 44 && _isEnv(env), "env");
        // debugger;
        counts[id] += 1;
        executions[id] = IRuntime.Trace(true, count, micros, unixtime, env, pub, sig);
        emit Executed(id, count, msg.sender, block.timestamp, micros, unixtime, env, pub, sig);
    }

    function _isEnv(string calldata env) internal pure returns (bool) {
        bytes calldata b = bytes(env);
        bytes memory p = "javascript:";
        if (b.length < p.length) return false;
        for (uint256 i = 0; i < p.length; i++) {
            if (b[i] != p[i]) return false;
        }
        return true;
    }

    function html(uint256 id) external view returns (string memory) {
        require(id < total, "unknown");
        return runtime.html(id, titles[id], poems[id], counts[id]);
    }

    function svg(uint256 id) external view returns (string memory) {
        require(id < total, "unknown");
        return runtime.svg(id, titles[id], executions[id]);
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        require(id < total, "unknown");
        return runtime.tokenURI(id, titles[id], poems[id], counts[id], executions[id]);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
