const AdvancedSecurity = require('../security/advancedSecurity');

describe('パスワードポリシー', () => {
  // 以前は [A-Za-z\d@$!%*#?&] のホワイトリストで全体を検証していたため、
  // 記号がハイフンやアンダースコアだと拒否されていた。
  // クライアント側の検証は通るのでユーザーには理由が分からなかった。
  test.each([
    'StrongPass123!@#',
    'MyPassword-123!',
    'Secure_Pass123!',
    'Password.123!abc',
    'Passw0rd+with=eq',
    'パスワードAbc123!',
  ])('許可される: %s', (pwd) => {
    expect(AdvancedSecurity.validatePassword(pwd)).toBe(true);
  });

  test.each([
    ['12文字未満', 'Short1!'],
    ['数字なし', 'NoDigitsHere!!!!'],
    ['記号なし', 'NoSymbolsHere123'],
    ['英字なし', '1234567890!!!!!!'],
  ])('拒否される（%s）: %s', (_label, pwd) => {
    expect(AdvancedSecurity.validatePassword(pwd)).toBe(false);
  });

  test('bcrypt の 72 バイト上限を超えるものは拒否する', () => {
    // 超過分は黙って切り捨てられ、利用者の意図とずれるため明示的に弾く
    expect(AdvancedSecurity.validatePassword('Aa1!' + 'x'.repeat(69))).toBe(false);
    expect(AdvancedSecurity.validatePassword('Aa1!' + 'x'.repeat(60))).toBe(true);
  });

  test('マルチバイト文字はバイト長で判定する', () => {
    // 日本語は 1 文字 3 バイト。24 文字で 72 バイトを超える
    expect(AdvancedSecurity.validatePassword('Aa1!' + 'あ'.repeat(30))).toBe(false);
  });

  test('文字列以外は拒否する', () => {
    expect(AdvancedSecurity.validatePassword(null)).toBe(false);
    expect(AdvancedSecurity.validatePassword(undefined)).toBe(false);
    expect(AdvancedSecurity.validatePassword(12345678901234)).toBe(false);
  });
});
