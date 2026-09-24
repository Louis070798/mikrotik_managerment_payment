import { buildApp } from '../../src/apps/api/main';

/**
 * Kiem tra ung dung DUNG duoc len — tuc la moi phu thuoc DI phan giai duoc.
 *
 * `tsc --noEmit` khong bat duoc loai loi nay: mot provider thieu trong module, mot service inject
 * thu chua duoc export, mot import vong -- tat ca deu chi no luc Nest khoi tao container. Ma cac
 * suite integration hien co lai can Postgres that nen khong chay duoc o moi noi.
 *
 * Test nay chi goi buildApp() + init(), KHONG truy van gi. Pool cua pg ket noi lazy (chi mo ket
 * noi o lan query dau), nen no chay duoc ma khong can database.
 */
const TOUCHED = [
  'DATABASE_CONTROL_URL', 'AUTH_TOKEN_SECRET',
  'RADIUS_ACCT_PORT', 'RADIUS_AUTH_PORT', 'NETFLOW_PORT', 'DNS_LOG_PORT',
];

describe('Bootstrap ứng dụng', () => {
  // jest chay --runInBand nen cac file test dung CHUNG mot process: doi process.env o day ma
  // khong tra lai se lam hong suite chay sau.
  const saved = new Map(TOUCHED.map((k) => [k, process.env[k]]));
  afterAll(() => {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('phân giải được toàn bộ phụ thuộc DI và init() thành công', async () => {
    // Tro DB vao mot dia chi khong ai dung -- neu co gi do QUERY ngay luc init, test se lo ra
    // thay vi am tham dung DB that.
    process.env.DATABASE_CONTROL_URL = 'postgres://nobody:nobody@127.0.0.1:1/nonexistent';
    process.env.AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET ?? 'test-secret-for-boot-only';
    // Cac collector UDP bind cong that; doi sang cong cao de khong dung do dang chay tren may.
    process.env.RADIUS_ACCT_PORT = '31813';
    process.env.RADIUS_AUTH_PORT = '31812';
    process.env.NETFLOW_PORT = '32055';
    process.env.DNS_LOG_PORT = '35514';

    const app = await buildApp();
    app.useLogger(false);
    await app.init();
    expect(app).toBeDefined();
    await app.close();
  }, 60000);
});
