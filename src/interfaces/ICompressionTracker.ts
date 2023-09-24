export default interface ICompressionTracker {
  crossLoopChars: string;
  dataPosition: number;
  builtString: string;
  bitCount: number;
  compressionIncrement: number;
  dataValue: number;
}
