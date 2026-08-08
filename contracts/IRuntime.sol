// SPDX-License-Identifier: WTFPL
pragma solidity 0.8.36;

interface IRuntime {
    struct Trace {
        bool    recorded;
        uint32  n;
        uint32  micros;
        uint64  unixTime;
        string  env;
        bytes32 pub;
        bytes   sig;
    }

    function html(uint256 id, string calldata title, string calldata poem, uint256 count) external view returns (string memory);

    function svg(uint256 id, string calldata title, Trace calldata execution) external view returns (string memory);

    function tokenURI(uint256 id, string calldata title, string calldata poem, uint256 count, Trace calldata execution) external view returns (string memory);
}
