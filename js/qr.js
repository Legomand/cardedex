// Small, dependency-free QR encoder for Cardédex handoff codes.
// Byte mode, QR versions 1-10, medium error correction.
(function (root) {
  "use strict";

  const MAX_BYTES = 213;
  const BLOCKS_M = [
    [[1, 26, 16]],
    [[1, 44, 28]],
    [[1, 70, 44]],
    [[2, 50, 32]],
    [[2, 67, 43]],
    [[4, 43, 27]],
    [[4, 49, 31]],
    [[2, 60, 38], [2, 61, 39]],
    [[3, 58, 36], [2, 59, 37]],
    [[4, 69, 43], [1, 70, 44]],
  ];
  const ALIGNMENT = [
    [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
  ];
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);

  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    EXP[index] = value;
    LOG[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let index = 255; index < EXP.length; index += 1) EXP[index] = EXP[index - 255];

  function multiply(left, right) {
    return left && right ? EXP[LOG[left] + LOG[right]] : 0;
  }

  function polynomialMultiply(left, right) {
    const result = new Uint8Array(left.length + right.length - 1);
    left.forEach((a, i) => right.forEach((b, j) => { result[i + j] ^= multiply(a, b); }));
    return result;
  }

  function reedSolomon(data, degree) {
    let generator = new Uint8Array([1]);
    for (let index = 0; index < degree; index += 1) {
      generator = polynomialMultiply(generator, new Uint8Array([1, EXP[index]]));
    }
    const remainder = new Uint8Array(degree);
    data.forEach((byte) => {
      const factor = byte ^ remainder[0];
      remainder.copyWithin(0, 1);
      remainder[degree - 1] = 0;
      for (let index = 0; index < degree; index += 1) {
        remainder[index] ^= multiply(generator[index + 1], factor);
      }
    });
    return remainder;
  }

  function appendBits(target, number, count) {
    for (let bit = count - 1; bit >= 0; bit -= 1) target.push((number >>> bit) & 1);
  }

  function blockList(version) {
    return BLOCKS_M[version - 1].flatMap(([count, total, data]) =>
      Array.from({ length: count }, () => ({ total, data }))
    );
  }

  function chooseVersion(length) {
    for (let version = 1; version <= 10; version += 1) {
      const dataCodewords = blockList(version).reduce((sum, block) => sum + block.data, 0);
      const countBits = version < 10 ? 8 : 16;
      if (4 + countBits + length * 8 <= dataCodewords * 8) return version;
    }
    return 0;
  }

  function makeCodewords(bytes, version) {
    const blocks = blockList(version);
    const dataCapacity = blocks.reduce((sum, block) => sum + block.data, 0);
    const bits = [];
    appendBits(bits, 0b0100, 4);
    appendBits(bits, bytes.length, version < 10 ? 8 : 16);
    bytes.forEach((byte) => appendBits(bits, byte, 8));
    appendBits(bits, 0, Math.min(4, dataCapacity * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let index = 0; index < bits.length; index += 8) {
      data.push(bits.slice(index, index + 8).reduce((byte, bit) => byte * 2 + bit, 0));
    }
    for (let pad = 0; data.length < dataCapacity; pad += 1) data.push(pad % 2 ? 0x11 : 0xec);

    let offset = 0;
    const dataBlocks = [];
    const errorBlocks = [];
    blocks.forEach((block) => {
      const chunk = Uint8Array.from(data.slice(offset, offset + block.data));
      offset += block.data;
      dataBlocks.push(chunk);
      errorBlocks.push(reedSolomon(chunk, block.total - block.data));
    });
    const result = [];
    const maxData = Math.max(...dataBlocks.map((block) => block.length));
    const maxError = Math.max(...errorBlocks.map((block) => block.length));
    for (let index = 0; index < maxData; index += 1) {
      dataBlocks.forEach((block) => { if (index < block.length) result.push(block[index]); });
    }
    for (let index = 0; index < maxError; index += 1) {
      errorBlocks.forEach((block) => { if (index < block.length) result.push(block[index]); });
    }
    return result;
  }

  function bch(value, polynomial) {
    let shifted = value;
    const degree = Math.floor(Math.log2(polynomial));
    shifted <<= degree;
    while (Math.floor(Math.log2(shifted)) >= degree) {
      shifted ^= polynomial << (Math.floor(Math.log2(shifted)) - degree);
    }
    return (value << degree) | shifted;
  }

  function maskBit(mask, row, column) {
    switch (mask) {
      case 0: return (row + column) % 2 === 0;
      case 1: return row % 2 === 0;
      case 2: return column % 3 === 0;
      case 3: return (row + column) % 3 === 0;
      case 4: return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0;
      case 5: return row * column % 2 + row * column % 3 === 0;
      case 6: return (row * column % 2 + row * column % 3) % 2 === 0;
      default: return ((row * column) % 3 + (row + column) % 2) % 2 === 0;
    }
  }

  function placeFinder(matrix, top, left) {
    const size = matrix.length;
    for (let row = -1; row <= 7; row += 1) {
      for (let column = -1; column <= 7; column += 1) {
        const y = top + row;
        const x = left + column;
        if (y < 0 || x < 0 || y >= size || x >= size) continue;
        matrix[y][x] = row >= 0 && row <= 6 && column >= 0 && column <= 6 &&
          (row === 0 || row === 6 || column === 0 || column === 6 ||
            (row >= 2 && row <= 4 && column >= 2 && column <= 4));
      }
    }
  }

  function placeAlignment(matrix, version) {
    const positions = ALIGNMENT[version - 1];
    positions.forEach((row) => positions.forEach((column) => {
      if (matrix[row][column] !== null) return;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          matrix[row + dy][column + dx] = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
        }
      }
    }));
  }

  function placeFormat(matrix, mask, test) {
    const size = matrix.length;
    const bits = bch(mask, 0x537) ^ 0x5412; // Error correction M has format value 0.
    for (let index = 0; index < 15; index += 1) {
      const dark = !test && ((bits >>> index) & 1) === 1;
      if (index < 6) matrix[index][8] = dark;
      else if (index < 8) matrix[index + 1][8] = dark;
      else matrix[size - 15 + index][8] = dark;
      if (index < 8) matrix[8][size - index - 1] = dark;
      else if (index === 8) matrix[8][7] = dark;
      else matrix[8][15 - index - 1] = dark;
    }
    matrix[size - 8][8] = !test;
  }

  function placeVersion(matrix, version, test) {
    if (version < 7) return;
    const size = matrix.length;
    const bits = bch(version, 0x1f25);
    for (let index = 0; index < 18; index += 1) {
      const dark = !test && ((bits >>> index) & 1) === 1;
      matrix[Math.floor(index / 3)][index % 3 + size - 11] = dark;
      matrix[index % 3 + size - 11][Math.floor(index / 3)] = dark;
    }
  }

  function buildMatrix(version, codewords, mask, test = false) {
    const size = version * 4 + 17;
    const matrix = Array.from({ length: size }, () => Array(size).fill(null));
    placeFinder(matrix, 0, 0);
    placeFinder(matrix, size - 7, 0);
    placeFinder(matrix, 0, size - 7);
    placeAlignment(matrix, version);
    for (let index = 8; index < size - 8; index += 1) {
      if (matrix[index][6] === null) matrix[index][6] = index % 2 === 0;
      if (matrix[6][index] === null) matrix[6][index] = index % 2 === 0;
    }
    placeFormat(matrix, mask, test);
    placeVersion(matrix, version, test);

    let byte = 0;
    let bit = 7;
    let row = size - 1;
    let direction = -1;
    for (let column = size - 1; column > 0; column -= 2) {
      if (column === 6) column -= 1;
      while (true) {
        for (let offset = 0; offset < 2; offset += 1) {
          const x = column - offset;
          if (matrix[row][x] !== null) continue;
          let dark = byte < codewords.length && ((codewords[byte] >>> bit) & 1) === 1;
          if (maskBit(mask, row, x)) dark = !dark;
          matrix[row][x] = dark;
          bit -= 1;
          if (bit < 0) { byte += 1; bit = 7; }
        }
        row += direction;
        if (row < 0 || row >= size) {
          row -= direction;
          direction = -direction;
          break;
        }
      }
    }
    return matrix;
  }

  function penalty(matrix) {
    const size = matrix.length;
    let score = 0;
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
          if ((!dx && !dy) || row + dy < 0 || column + dx < 0 || row + dy >= size || column + dx >= size) continue;
          if (matrix[row][column] === matrix[row + dy][column + dx]) neighbors += 1;
        }
        if (neighbors > 5) score += 3 + neighbors - 5;
        if (row + 1 < size && column + 1 < size) {
          const count = [matrix[row][column], matrix[row + 1][column], matrix[row][column + 1], matrix[row + 1][column + 1]].filter(Boolean).length;
          if (count === 0 || count === 4) score += 3;
        }
        if (column + 6 < size && [true, false, true, true, true, false, true].every((value, i) => matrix[row][column + i] === value)) score += 40;
        if (row + 6 < size && [true, false, true, true, true, false, true].every((value, i) => matrix[row + i][column] === value)) score += 40;
      }
    }
    const dark = matrix.flat().filter(Boolean).length;
    score += Math.floor(Math.abs(100 * dark / (size * size) - 50) / 5) * 10;
    return score;
  }

  function encode(text) {
    const bytes = new TextEncoder().encode(String(text));
    if (bytes.length > MAX_BYTES) throw new RangeError("qr-capacity");
    const version = chooseVersion(bytes.length);
    if (!version) throw new RangeError("qr-capacity");
    const codewords = makeCodewords(bytes, version);
    let best = null;
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask += 1) {
      const candidate = buildMatrix(version, codewords, mask);
      const candidateScore = penalty(candidate);
      if (candidateScore < bestScore) { best = candidate; bestScore = candidateScore; }
    }
    return { matrix: best, version, byteLength: bytes.length };
  }

  function toSvg(text, options = {}) {
    const result = encode(text);
    const quiet = 4;
    const size = result.matrix.length + quiet * 2;
    const path = [];
    result.matrix.forEach((row, y) => row.forEach((dark, x) => {
      if (dark) path.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
    }));
    const label = String(options.label || "Cardédex trade offer QR code").replace(/[<>&"]/g, "");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path.join("")}" fill="#000"/></svg>`;
  }

  root.CardedexQr = { MAX_BYTES, encode, toSvg };
}(globalThis));
