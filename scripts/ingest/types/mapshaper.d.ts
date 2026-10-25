// mapshaper（地図データの加工）には型の定義が無いので、使う関数だけを書く
// https://github.com/mbloch/mapshaper/wiki/Using-mapshaper-programmatically
declare module "mapshaper" {
  const mapshaper: {
    /** コマンドを実行する。input はファイル名 → 中身。出力のファイル名 → 中身を返す */
    applyCommands(commands: string, input?: Record<string, Uint8Array | string>): Promise<Record<string, Uint8Array>>;
  };
  export default mapshaper;
}
