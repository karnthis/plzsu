import Plzsu from '../src';

const P = new Plzsu();
const testString = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
const compressedString = 'ಇ끎੠똀䂖p㎁嵠ጐۜ㉜ű聃⠠‚᠆㄀㬤⚠ӵᎉ櫣ꁳ᠐눐݄';

describe('Plzsu.compress()', () => {
  it('Compresses', () => {
    const compressed = P.compress(testString);
    expect(compressed.length).toBeLessThan(testString.length);
    expect(compressed).toMatch(compressedString);
  });
});

describe('Plzsu.decompress()', () => {
  it('Decompresses', () => {
    const decompressed = P.decompress(compressedString);
    expect(decompressed.length).toEqual(testString.length);
    expect(decompressed).toMatch(testString);
  });
});
