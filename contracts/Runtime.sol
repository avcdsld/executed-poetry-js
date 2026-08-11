// SPDX-License-Identifier: WTFPL
pragma solidity 0.8.36;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "./IRuntime.sol";

interface ISSTORE2 {
    function read(address pointer) external view returns (bytes memory);
}

library SSTORE2 {
    function write(bytes memory data) internal returns (address pointer) {
        bytes memory code = abi.encodePacked(hex"00", data);
        bytes memory creation = abi.encodePacked(hex"63", uint32(code.length), hex"80_60_0E_60_00_39_60_00_F3", code);
        assembly {
            pointer := create(0, add(creation, 32), mload(creation))
        }
        require(pointer != address(0), "write failed");
    }

    function read(address pointer) internal view returns (bytes memory data) {
        uint256 size;
        assembly { size := extcodesize(pointer) }
        require(size > 1, "empty");
        size -= 1;
        data = new bytes(size);
        assembly { extcodecopy(pointer, add(data, 32), 1, size) }
    }
}

contract Runtime is IRuntime, Ownable {
    address public font;
    address public lib;
    address[6] public htmlParts;
    address[4] public svgParts;
    mapping(uint256 => address) public figures;

    string internal constant REC = "18.07";
    string internal constant RX  = "159.70";
    string internal constant VX  = "209.02";

    string internal constant DESC =
        "Executed Poetry for JavaScript is a series of seven code poems that run. Each poem is held in a single self-contained HTML file, stored on Ethereum as a fully onchain token. The original exists only there. When a copy is opened in a browser, the poem runs on the reader's machine.\\n\\n"
        "Each poem pairs a short title in plain language with a few lines of code. The title speaks of human things: knowing yourself, being fine, remembering someone, making a promise. The computer takes the title at its word and executes it. Poetry arises in the gap between what is said and what is done.\\n\\n"
        "Each time the code is executed, a signature is displayed as the testimony of that run. The execution environment derives a key pair from its own particulars and signs the moment and context of the execution. The testimony remains. The event it pointed to does not return.\\n\\n"
        "The code, its execution environment, and the means of verification persist together, as a record on the blockchain and an execution in the browser. This work treats code as a readable structure. Its execution is itself an act of verification.";

    constructor() Ownable(msg.sender) {}

    function setFont(bytes calldata data) external onlyOwner {
        font = SSTORE2.write(data);
    }

    function setLib(bytes calldata data) external onlyOwner {
        lib = SSTORE2.write(data);
    }

    function setHtmlPart(uint256 i, bytes calldata data) external onlyOwner {
        require(i < 6, "range");
        htmlParts[i] = SSTORE2.write(data);
    }

    function setSvgPart(uint256 i, bytes calldata data) external onlyOwner {
        require(i < 4, "range");
        svgParts[i] = SSTORE2.write(data);
    }

    function setFigure(uint256 id, bytes calldata data) external onlyOwner {
        figures[id] = SSTORE2.write(data);
    }

    function html(uint256, string calldata title, string calldata poem, uint256 count) external view returns (string memory) {
        return string(abi.encodePacked(
            SSTORE2.read(htmlParts[0]),
            SSTORE2.read(font),
            SSTORE2.read(htmlParts[1]),
            title,
            SSTORE2.read(htmlParts[2]),
            bytes(poem),
            SSTORE2.read(htmlParts[3]),
            SSTORE2.read(lib),
            SSTORE2.read(htmlParts[4]),
            _u(count),
            SSTORE2.read(htmlParts[5])
        ));
    }

    function svg(uint256 id, string calldata title, Trace calldata execution) external view returns (string memory) {
        return string(abi.encodePacked(
            SSTORE2.read(svgParts[0]),
            title,
            SSTORE2.read(svgParts[1]),
            SSTORE2.read(font),
            SSTORE2.read(svgParts[2]),
            SSTORE2.read(figures[id]),
            _footer(title, execution),
            SSTORE2.read(svgParts[3])
        ));
    }

    function tokenURI(uint256 id, string calldata title, string calldata poem, uint256 count, Trace calldata execution) external view returns (string memory) {
        string memory image = Base64.encode(bytes(this.svg(id, title, execution)));
        string memory anim  = Base64.encode(bytes(this.html(id, title, poem, count)));
        string memory json = string.concat(
            '{"name":"', title,
            '","description":"', DESC,
            '","image":"data:image/svg+xml;base64,', image,
            '","animation_url":"data:text/html;base64,', anim,
            '","attributes":[',
                '{"trait_type":"Title","value":"', title, '"},',
                '{"trait_type":"Executions","value":', _u(count), '}',
                _lastRun(execution),
            ']}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _lastRun(Trace calldata t) internal pure returns (string memory) {
        if (!t.recorded) return "";
        return string.concat(',{"trait_type":"Last Run","value":"', _utc(t.unixTime), '"}');
    }

    function _footer(string calldata title, Trace calldata t) internal pure returns (string memory) {
        string memory env = t.recorded ? t.env : "javascript | unexecuted";
        string memory pubHex = _hex(t.pub);
        string memory sigHi = t.recorded ? _hex(t.sig, 0) : pubHex;
        string memory sigLo = t.recorded ? _hex(t.sig, 32) : pubHex;

        string memory ex = string.concat("executed #", _u(t.n), " in ", _ms(t.micros), "ms | ", title);
        (string memory a, string memory b, bool wrapped) = _wrapExec(ex);

        string[6] memory lbl;
        string[6] memory val;
        lbl[0] = "msg"; val[0] = string.concat(_esc(env), " | ", _utc(t.unixTime));
        lbl[1] = "";    val[1] = a;
        uint256 k = 2;
        if (wrapped) { lbl[k] = ""; val[k] = b; k++; }
        lbl[k] = "pub"; val[k] = pubHex; k++;
        lbl[k] = "sig"; val[k] = sigHi;  k++;
        lbl[k] = "";    val[k] = sigLo;  k++;
        uint256 nrows = k;

        uint256 start = 6 - nrows;
        bytes memory out;
        bool first = true;
        for (uint256 i = 0; i < nrows; i++) {
            string memory y = _slot(start + i);
            if (bytes(lbl[i]).length > 0) {
                if (!first) out = abi.encodePacked(out, "\n");
                first = false;
                out = abi.encodePacked(out, _text(RX, y, lbl[i]));
            }
            if (!first) out = abi.encodePacked(out, "\n");
            first = false;
            out = abi.encodePacked(out, _text(VX, y, val[i]));
        }
        return string(out);
    }

    function _text(string memory x, string memory y, string memory v) internal pure returns (string memory) {
        return string.concat('<text x="', x, '" y="', y, '" font-size="', REC, '" text-anchor="start">', v, '</text>');
    }

    function _esc(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory o = new bytes(b.length * 5);
        uint256 k;
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            if (c == 0x26) { o[k++] = "&"; o[k++] = "a"; o[k++] = "m"; o[k++] = "p"; o[k++] = ";"; }
            else if (c == 0x3c) { o[k++] = "&"; o[k++] = "l"; o[k++] = "t"; o[k++] = ";"; }
            else if (c == 0x3e) { o[k++] = "&"; o[k++] = "g"; o[k++] = "t"; o[k++] = ";"; }
            else { o[k++] = c; }
        }
        bytes memory r = new bytes(k);
        for (uint256 i = 0; i < k; i++) r[i] = o[i];
        return string(r);
    }

    function _wrapExec(string memory s) internal pure returns (string memory, string memory, bool) {
        bytes memory b = bytes(s);
        if (b.length <= 64) return (s, "", false);
        int256 cut = -1;
        for (uint256 i = 0; i <= 64; i++) {
            if (b[i] == 0x20) cut = int256(i);
        }
        if (cut <= 0) return (_slice(b, 0, 64), _slice(b, 64, b.length), true);
        uint256 c = uint256(cut);
        return (_slice(b, 0, c), _slice(b, c + 1, b.length), true);
    }

    function _slice(bytes memory b, uint256 s, uint256 e) internal pure returns (string memory) {
        bytes memory r = new bytes(e - s);
        for (uint256 i = 0; i < r.length; i++) r[i] = b[s + i];
        return string(r);
    }

    function _slot(uint256 i) internal pure returns (string memory) {
        if (i == 0) return "772.71";
        if (i == 1) return "799.81";
        if (i == 2) return "826.91";
        if (i == 3) return "854.02";
        if (i == 4) return "881.12";
        return "908.22";
    }

    function _u(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 j = v;
        uint256 len;
        while (j != 0) { len++; j /= 10; }
        bytes memory r = new bytes(len);
        while (v != 0) { len--; r[len] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(r);
    }

    function _hex(bytes32 v) internal pure returns (string memory) {
        bytes memory H = "0123456789abcdef";
        bytes memory r = new bytes(64);
        for (uint256 i = 0; i < 32; i++) {
            uint8 x = uint8(v[i]);
            r[2 * i]     = H[x >> 4];
            r[2 * i + 1] = H[x & 0x0f];
        }
        return string(r);
    }

    function _hex(bytes calldata b, uint256 o) internal pure returns (string memory) {
        bytes memory H = "0123456789abcdef";
        bytes memory r = new bytes(64);
        for (uint256 i = 0; i < 32; i++) {
            uint8 x = uint8(b[o + i]);
            r[2 * i]     = H[x >> 4];
            r[2 * i + 1] = H[x & 0x0f];
        }
        return string(r);
    }

    function _ms(uint32 micros) internal pure returns (string memory) {
        return string.concat(_u(uint256(micros) / 1000), ".", _pad3(uint256(micros) % 1000));
    }

    function _pad3(uint256 v) internal pure returns (string memory) {
        if (v < 10)  return string.concat("00", _u(v));
        if (v < 100) return string.concat("0",  _u(v));
        return _u(v);
    }

    function _utc(uint64 secs) internal pure returns (string memory) {
        uint256 s = secs;
        uint256 sod = s % 86400;
        (uint256 year, uint256 month, uint256 day) = _daysToDate(s / 86400);
        return string.concat(_pad4(year), "-", _pad2(month), "-", _pad2(day), " ", _pad2(sod / 3600), ":", _pad2((sod % 3600) / 60), ":", _pad2(sod % 60), " UTC");
    }

    function _pad2(uint256 v) internal pure returns (string memory) {
        return v < 10 ? string.concat("0", _u(v)) : _u(v);
    }

    function _pad4(uint256 v) internal pure returns (string memory) {
        if (v < 10)   return string.concat("000", _u(v));
        if (v < 100)  return string.concat("00",  _u(v));
        if (v < 1000) return string.concat("0",   _u(v));
        return _u(v);
    }

    function _daysToDate(uint256 daysSinceEpoch) internal pure returns (uint256 year, uint256 month, uint256 day) {
        int256 L = int256(daysSinceEpoch) + 68569 + 2440588;
        int256 n = (4 * L) / 146097;
        L = L - (146097 * n + 3) / 4;
        int256 y = (4000 * (L + 1)) / 1461001;
        L = L - (1461 * y) / 4 + 31;
        int256 m = (80 * L) / 2447;
        int256 d = L - (2447 * m) / 80;
        L = m / 11;
        m = m + 2 - 12 * L;
        y = 100 * (n - 49) + y + L;
        year = uint256(y);
        month = uint256(m);
        day = uint256(d);
    }
}
