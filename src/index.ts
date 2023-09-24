import { ICompressionTracker, IDecompressionTracker } from '@/interfaces';

const keyStrShared =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+';

export default class Plzsu {
  public readonly keyStrBase64: string = keyStrShared + '/=';
  public readonly keyStrUriSafe: string = keyStrShared + '-$';
  private readonly dictMapBase64: Map<string, number>;
  private readonly dictMapUriSafe: Map<string, number>;

  constructor() {
    this.dictMapBase64 = buildStrNumDictMap(this.keyStrBase64);
    this.dictMapUriSafe = buildStrNumDictMap(this.keyStrUriSafe);
  }

  compressToBase64(toCompress: string): string {
    const result = this.baseCompress(toCompress, 6, n =>
      this.keyStrBase64.charAt(n)
    );
    switch (result.length % 4) {
      case 0:
        return result;
      case 1:
        return result + '===';
      case 2:
        return result + '==';
      case 3:
        return result + '=';
      default:
        throw new Error('Invalid Result');
    }
  }
  decompressFromBase64(toDecompress: string): string {
    return this.baseDecompress(
      toDecompress,
      32,
      (str: string, index: number) =>
        this.dictMapBase64.get(str.charAt(index)) as number
    );
  }

  compressToUTF16(toCompress: string): string {
    return this.baseCompress(toCompress, 15, n => String.fromCharCode(n + 32));
  }
  decompressFromUTF16(toDecompress: string): string {
    return this.baseDecompress(
      toDecompress,
      16384,
      (str: string, index: number) => str.charCodeAt(index) - 32
    );
  }

  compressToUint8Array(toCompress: string): Uint8Array {
    const compressed = this.compress(toCompress);
    return new TextEncoder().encode(compressed);
  }
  decompressFromUint8Array(toDecompress: Uint8Array): string {
    const stringed = new TextDecoder().decode(toDecompress);
    return this.decompress(stringed);
  }

  compressToEncodedURIComponent(toCompress: string): string {
    return this.baseCompress(toCompress, 6, n => this.keyStrUriSafe.charAt(n));
  }
  decompressFromEncodedURIComponent(toDecompress: string): string {
    const cleaned = toDecompress.replace(/ /g, '+');
    return this.baseDecompress(
      cleaned,
      32,
      (str: string, index: number) =>
        this.dictMapUriSafe.get(str.charAt(index)) as number
    );
  }

  compress(toCompress: string): string {
    return this.baseCompress(toCompress, 16, n => String.fromCharCode(n));
  }
  decompress(toDecompress: string): string {
    return this.baseDecompress(
      toDecompress,
      32768,
      (str: string, index: number) => str.charCodeAt(index)
    );
  }

  private baseCompress(
    input: string,
    bitsPerChar: number,
    charFunc: (i: number) => string
  ): string {
    if (typeof input === 'string' && input.length > 0) {
      const compressionDict = buildStrNumDictMap('');
      const compressionDictToCreate = buildStrNumDictMap('');
      const compressionDictSizeOffset = 3;

      const trackers: ICompressionTracker = {
        crossLoopChars: '', // context_w
        dataPosition: 0, // context_data_position
        builtString: '', // context_data
        bitCount: 2, // context_numBits
        compressionIncrement: 2, // context_enlargeIn
        dataValue: 0, // context_data_val
      };

      for (let i = 0; i < input.length; ++i) {
        const loopChar = input[i]; // context_c
        if (!compressionDict.has(loopChar)) {
          compressionDict.set(
            loopChar,
            compressionDictSizeOffset + compressionDict.size
          );
          compressionDictToCreate.set(loopChar, 1);
        }

        const mergedLoopChars = trackers.crossLoopChars + loopChar; // context_wc
        if (compressionDict.has(mergedLoopChars)) {
          trackers.crossLoopChars = mergedLoopChars;
        } else {
          batchCompressionLoops(
            trackers,
            compressionDictToCreate,
            compressionDict,
            bitsPerChar,
            charFunc
          );
          compressionDict.set(
            mergedLoopChars,
            compressionDictSizeOffset + compressionDict.size
          );
          trackers.crossLoopChars = loopChar;
        }
      }

      if (trackers.crossLoopChars !== '') {
        batchCompressionLoops(
          trackers,
          compressionDictToCreate,
          compressionDict,
          bitsPerChar,
          charFunc
        );
      }

      loopCompressionCharBits(trackers, bitsPerChar, 2, 'bitwise', charFunc);

      while (true) {
        trackers.dataValue = trackers.dataValue << 1;
        if (trackers.dataPosition === bitsPerChar - 1) {
          trackers.builtString += charFunc(trackers.dataValue);
          break;
        } else {
          trackers.dataPosition++;
        }
      }
      return trackers.builtString;
    } else {
      return '';
    }
  }
  private baseDecompress(
    input: string,
    resetValue: number,
    charCodeFunc: (str: string, i: number) => number
  ): string {
    if (typeof input === 'string' && input.length > 0) {
      const srcLength = input.length;
      const decompressionDict = buildNumStrDictMap(3);
      let result = '';
      let decompressionIncrement = 4;
      let numBits = 3;
      let wtf = '';

      const tracker: IDecompressionTracker = {
        // data
        currCompressedChar: charCodeFunc(input, 0), // val
        position: resetValue, // position
        index: 1,
      };
      const topBits = loopDecompressionBits(
        tracker,
        input,
        resetValue,
        2,
        charCodeFunc
      );
      const topBitFilter = topBits === 0 ? 8 : topBits === 1 ? 16 : '';
      if (typeof topBitFilter === 'string') {
        return '';
      }
      const topChar = String.fromCharCode(
        loopDecompressionBits(
          tracker,
          input,
          resetValue,
          topBitFilter,
          charCodeFunc
        )
      );
      decompressionDict.set(3, topChar);
      wtf = topChar;
      result += topChar;

      while (true) {
        if (tracker.index > srcLength) {
          return '';
        }
        const loopBits = loopDecompressionBits(
          tracker,
          input,
          resetValue,
          numBits,
          charCodeFunc
        );

        let dictMaxIndex = loopBits;
        let loopChar = '';
        switch (loopBits) {
          case 0:
            loopChar = String.fromCharCode(
              loopDecompressionBits(tracker, input, resetValue, 8, charCodeFunc)
            );
            decompressionDict.set(decompressionDict.size, loopChar);
            dictMaxIndex = decompressionDict.size - 1;
            decompressionIncrement--;
            break;
          case 1:
            loopChar = String.fromCharCode(
              loopDecompressionBits(
                tracker,
                input,
                resetValue,
                16,
                charCodeFunc
              )
            );
            decompressionDict.set(decompressionDict.size, loopChar);
            dictMaxIndex = decompressionDict.size - 1;
            decompressionIncrement--;
            break;
          case 2:
            return result;
        }

        if (decompressionIncrement === 0) {
          decompressionIncrement = Math.pow(2, numBits);
          numBits++;
        }
        let value = '';
        if (decompressionDict.has(dictMaxIndex)) {
          value = decompressionDict.get(dictMaxIndex) || '';
        } else if (dictMaxIndex === decompressionDict.size) {
          value = wtf + wtf.charAt(0);
        } else {
          return '';
        }
        result += value;

        decompressionDict.set(decompressionDict.size, wtf + value.charAt(0));
        decompressionIncrement--;
        wtf = value;
        if (decompressionIncrement === 0) {
          decompressionIncrement = Math.pow(2, numBits);
          numBits++;
        }
      }
    } else {
      return '';
    }
  }
}

function buildStrNumDictMap(base: string): Map<string, number> {
  const dict = new Map<string, number>();
  for (let i = 0; i < base.length; i++) {
    dict.set(base[i], i);
  }
  return dict;
}
function buildNumStrDictMap(base: number): Map<number, string> {
  const dict = new Map<number, string>();
  for (let i = 0; i < base; ++i) {
    dict.set(i, i.toString());
  }
  return dict;
}

/** Compression Funcs */
function loopCompressionCharBits(
  tracker: ICompressionTracker,
  bitsPerChar: number,
  initialValue: number,
  mode: string,
  charFunc: (i: number) => string,
  override?: number
): void {
  let workingValue = initialValue;
  for (let i = 0; i < (Number(override) || tracker.bitCount); i++) {
    switch (true) {
      case mode === 'none':
        tracker.dataValue = tracker.dataValue << 1;
        break;
      case mode === 'raw':
        tracker.dataValue = (tracker.dataValue << 1) | workingValue;
        break;
      case mode === 'bitwise':
        tracker.dataValue = (tracker.dataValue << 1) | (workingValue & 1);
        break;
      default:
        throw new Error('Invalid Mode');
    }

    if (tracker.dataPosition === bitsPerChar - 1) {
      tracker.dataPosition = 0;
      tracker.builtString += charFunc(tracker.dataValue);
      tracker.dataValue = 0;
    } else {
      tracker.dataPosition++;
    }

    switch (true) {
      case mode === 'none':
        break;
      case mode === 'raw':
        workingValue = 0;
        break;
      case mode === 'bitwise':
        workingValue = workingValue >> 1;
        break;
      default:
        throw new Error('Invalid Mode');
    }
  }
}
function batchCompressionLoops(
  tracker: ICompressionTracker,
  compressionDictToCreate: Map<string, number>,
  compressionDict: Map<string, number>,
  bitsPerChar: number,
  charFunc: (i: number) => string
): void {
  if (compressionDictToCreate.has(tracker.crossLoopChars)) {
    if (tracker.crossLoopChars.charCodeAt(0) < 256) {
      loopCompressionCharBits(tracker, bitsPerChar, 0, 'none', charFunc);
      loopCompressionCharBits(
        tracker,
        bitsPerChar,
        tracker.crossLoopChars.charCodeAt(0),
        'bitwise',
        charFunc,
        8
      );
    } else {
      loopCompressionCharBits(tracker, bitsPerChar, 1, 'raw', charFunc);
      loopCompressionCharBits(
        tracker,
        bitsPerChar,
        tracker.crossLoopChars.charCodeAt(0),
        'bitwise',
        charFunc,
        16
      );
    }
    updateCompressionBitcount(tracker);
    compressionDictToCreate.delete(tracker.crossLoopChars);
  } else {
    loopCompressionCharBits(
      tracker,
      bitsPerChar,
      compressionDict.get(tracker.crossLoopChars) || 0,
      'bitwise',
      charFunc
    );
  }
  updateCompressionBitcount(tracker);
}
function updateCompressionBitcount(tracker: ICompressionTracker): void {
  tracker.compressionIncrement--;
  if (tracker.compressionIncrement === 0) {
    tracker.compressionIncrement = Math.pow(2, tracker.bitCount);
    tracker.bitCount++;
  }
}

/** Decompression Funcs */
function loopDecompressionBits(
  data: IDecompressionTracker,
  sourceStr: string,
  resetValue: number,
  exponent: number,
  charCodeFunc: (str: string, i: number) => number
): number {
  let bits = 0;
  const maxpower = Math.pow(2, exponent);
  let power = 1;
  while (power !== maxpower) {
    const bitMatch = data.currCompressedChar & data.position;
    data.position >>= 1;
    if (data.position === 0) {
      data.position = resetValue;
      data.currCompressedChar = charCodeFunc(sourceStr, data.index++);
    }
    bits |= (bitMatch > 0 ? 1 : 0) * power;
    power <<= 1;
  }
  return bits;
}
