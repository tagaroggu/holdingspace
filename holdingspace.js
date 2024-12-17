/*
    Simple memory allocation implementation for WebAssembly. 
    I'm writing this first in JavaScript to get the idea, then
    it will be reimplemented in WASM. Yes I am aware this is just
    JavaScript and not TypeScript, I'm lazy and will roll with the punches.
 */

const buffer = new ArrayBuffer(0xFFFF + 1); // One page
const view = new DataView(buffer);

/* 
    Wasm currently supports 32 bit addressing, not 64.
    I'm choosing to store all pointers as 4 bytes.
    That does mean that for small apps with little memory usage
    there will be an overabundance of memory usage, but I'm lazy.
    When using DataViews, use little endian for WASM support. 
    `view.setInt32(offset, value, littleEndianness)`
*/

/*
    Yes this does look janky already. Will rewrite into smaller,
    discrete functions before reimplementation.
 */

function malloc(size) {
    const pointer = findFreeZoneOfSize(size);
    let metadata = view.getUint32(pointer + 4, true);
    let blockSize = metadata >> 1;
    view.setUint32(pointer + 4, (size << 1) | 1, true);
    view.setUint32(pointer + blockSize + 8, pointer, true);
    if (blockSize > (size + 8)) {
        // If block is at least 9 bytes bigger, split
        let newPointer = pointer + size + 8;
        view.setUint32(newPointer, pointer, true);
        view.setUint32(newPointer + 4, blockSize - (size + 8), true);
        view.setUint32(pointer + blockSize + 8, newPointer, true);
    }
    return pointer + 8;
}

/*
    8 Bytes is pretty inefficient for storing info about
    allocation but when you gotta store both a pointer to the
    prev block, block size, and whether or not the block is used.
    Structure: 4 bytes for pointer, 4 byte metadata
*/
function findFreeZoneOfSize(size) {
    let pointer = 0;
    while (true) {
        let _prevPointer = view.getUint32(pointer, true);
        let metadata = view.getUint32(pointer + 4, true);
        let blockSize = metadata >> 1;
        let isUsed = metadata & 1;
        if (!isUsed && (blockSize <= size || blockSize === 0)) break;
        let nextPointer = pointer + blockSize + 8; // 8 for prev pointer and metadata bytes
        if (nextPointer >= buffer.byteLength) throw new Error('Cannot allocate beyond buffer size')
        pointer = nextPointer;
    }

    return pointer;
}

function free(pointer) {
    pointer = pointer - 8;
    let prevPointer = view.getUint32(pointer, true);
    let metadata = view.getUint32(pointer + 4, true);
    let blockSize = metadata >> 1;
    view.setUint32(pointer + 4, (blockSize << 1) & 0xFFFFFFFE, true)
    // Collapse adjacent blocks
    if (!(view.getUint32(prevPointer + 4, true) & 1)) {
        let prevMetadata = view.getUint32(prevPointer + 4);
        let prevSize = prevMetadata >> 1;
        view.setUint32(prevPointer + 4, ((prevSize + blockSize + 8) << 1) & 0xFFFFFFFE, true);
        pointer = prevPointer;
        metadata = prevMetadata;
        blockSize = prevSize + blockSize + 8;
    }
    let nextPointer = pointer + blockSize + 8;
    if (!(view.getUint32(nextPointer + 4, true) & 1)) {
        let nextMetadata = view.getUint32(nextPointer + 4, true);
        let nextSize = nextMetadata >> 1;
        view.setUint32(pointer + 4, ((blocksize + nextSize + 8) << 1) & 0xFFFFFFFE, true);
    }
}
