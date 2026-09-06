import { parseEnvContent, resolveEnvFile } from '../../scripts/load-env';

/**
 * scripts/load-env.ts là thứ đứng giữa "chạy migrate lên DB test" và "chạy nhầm lên DB dev",
 * nên hành vi chọn file và parse phải rõ ràng, không đoán.
 */
describe('load-env', () => {
  it('parse được dòng thường, bỏ comment/dòng trống, gỡ dấu nháy và tiền tố export', () => {
    expect(
      parseEnvContent(['# comment', '', 'NODE_ENV=test', 'export PORT=3000', 'URL="postgres://u:p@h:5432/db"', "LOG='warn'", 'BROKEN'].join('\n')),
    ).toEqual({ NODE_ENV: 'test', PORT: '3000', URL: 'postgres://u:p@h:5432/db', LOG: 'warn' });
  });

  it('giá trị chứa dấu = (mật khẩu, connection string) không bị cắt', () => {
    expect(parseEnvContent('DATABASE_CONTROL_URL=postgres://u:p=x@h:54329/db')).toEqual({
      DATABASE_CONTROL_URL: 'postgres://u:p=x@h:54329/db',
    });
  });

  it('--env trỏ vào file không tồn tại là LỖI, không im lặng rơi về .env', () => {
    expect(() => resolveEnvFile(['--env=.env.khong-ton-tai'])).toThrow(/Env file not found/);
    expect(() => resolveEnvFile(['--env', '.env.khong-ton-tai'])).toThrow(/Env file not found/);
  });

  it('--env=.env.test.example (file có thật trong repo) được chọn đúng', () => {
    expect(resolveEnvFile(['--env=.env.test.example'])).toMatch(/\.env\.test\.example$/);
  });
});
