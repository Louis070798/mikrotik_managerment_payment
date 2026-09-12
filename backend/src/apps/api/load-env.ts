import { config } from 'dotenv';

/**
 * PHAI la import DAU TIEN trong main.ts (truoc ca 'reflect-metadata').
 *
 * Ly do co 1 loi that da gay ra toan bo yeu cau "phai tu tay export bien .env vao shell truoc
 * moi lan restart" (ghi nhan lai nhieu lan trong phien lam viec nay) -- code cu goi config() nhu
 * 1 LOI GOI HAM binh thuong o giua than main.ts, SAU dong `import { AppModule } from './app.module'`.
 * Khi TypeScript bien dich `import` sang CommonJS, MOI `require()` cua cac import tinh (static
 * import) duoc dua len chay TRUOC, theo dung thu tu khai bao, roi moi den cac dong code thuong
 * (nhu goi ham config()) o duoi. Vi vay `require('./app.module')` — keo theo
 * `config.module.ts` doc `process.env.DATABASE_CONTROL_URL` NGAY luc module duoc load — luon
 * chay TRUOC ca khi `config()` kip duoc goi, du no dung o dong code truoc do ve mat van ban.
 * Ket qua: bien .env tu file KHONG BAO GIO duoc dotenv nap that (chi hoat dong khi shell da co
 * san bien do tu truoc, vd do da tung export tay 1 lan) — day la nguyen nhan that cua loi
 * "DATABASE_CONTROL_URL: Required" moi khi khoi dong tu 1 shell/background task hoan toan moi.
 *
 * Sua dung cach: tach config() ra 1 module RIENG, import no o DONG DAU TIEN cua main.ts (truoc
 * moi import khac, ke ca 'reflect-metadata') -- luc do require('./load-env') chay va hoan tat
 * TRUOC MOI require nao khac, dung thu tu can co.
 */
config();
