require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const cors = require("cors");
const { google } = require("googleapis");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// === KONEKSI GOOGLE SHEETS ===
const auth = new google.auth.GoogleAuth({
  credentials: {
    type: "service_account",
    client_email: process.env.EMAIL_AKUN_LAYANAN,
    private_key: process.env.KUNCI_PRIBADI.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const ID_SHEET = process.env.ID_SPREADSHEET;

// === KIRIM EMAIL ===
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_PENGIRIM,
    pass: process.env.KATA_SANDI_EMAIL,
  },
});

// === FUNGSI BACA & TULIS GOOGLE SHEETS ===
async function bacaSheet(namaSheet) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: ID_SHEET,
      range: `${namaSheet}!A:Z`,
    });
    const baris = res.data.values || [];
    if (baris.length < 2) return [];
    const kepala = baris[0].map((k) => k.trim());
    return baris.slice(1).map((b) => {
      const obj = {};
      kepala.forEach((k, i) => (obj[k] = b[i] || ""));
      return obj;
    });
  } catch (e) {
    console.error(`❌ Baca ${namaSheet} gagal:`, e.message);
    return [];
  }
}

async function tambahBaris(namaSheet, data) {
  const kepala = Object.keys(data);
  const nilai = kepala.map((k) => data[k] || "");
  await sheets.spreadsheets.values.append({
    spreadsheetId: ID_SHEET,
    range: `${namaSheet}!A:Z`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [nilai] },
  });
}

async function perbaruiKolom(
  namaSheet,
  kunciId,
  nilaiId,
  kolomDiubah,
  nilaiBaru,
) {
  const semua = await bacaSheet(namaSheet);
  const indeks = semua.findIndex((b) => b[kunciId] === nilaiId);
  if (indeks === -1) return false;
  const kepala = Object.keys(semua[0] || {});
  const posisi = kepala.indexOf(kolomDiubah);
  if (posisi === -1) return false;
  const huruf = String.fromCharCode(65 + posisi);
  await sheets.spreadsheets.values.update({
    spreadsheetId: ID_SHEET,
    range: `${namaSheet}!${huruf}${indeks + 3}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[nilaiBaru]] },
  });
  return true;
}

const kodeVerifikasi = {};

// === API ENDPOINT ===
app.post("/kirim-kode", async (req, res) => {
  const { email } = req.body;
  const kode = Math.floor(100000 + Math.random() * 900000).toString();
  kodeVerifikasi[email] = { kode, kadaluarsa: Date.now() + 600000 };

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_PENGIRIM,
      to: email,
      subject: "Kode Verifikasi Aplikasi Chat",
      html: `<h3>Kode Anda: ${kode}</h3><p>Berlaku 10 menit.</p>`,
    });
    res.json({ berhasil: true, pesan: "✅ Kode dikirim ke email Anda" });
  } catch (err) {
    console.error(err);
    res.json({
      berhasil: false,
      pesan: "❌ Gagal mengirim kode, cek konfigurasi email",
    });
  }
});

app.post("/daftar", async (req, res) => {
  const { nama, email, kataSandi, kode } = req.body;
  const cek = kodeVerifikasi[email];

  if (!cek || cek.kode !== kode || Date.now() > cek.kadaluarsa) {
    return res.json({
      berhasil: false,
      pesan: "❌ Kode salah atau sudah kadaluarsa",
    });
  }

  const semuaPengguna = await bacaSheet("Pengguna");
  if (semuaPengguna.find((u) => u.email === email)) {
    return res.json({ berhasil: false, pesan: "❌ Email sudah terdaftar" });
  }

  const kataSandiEnkripsi = await bcrypt.hash(kataSandi, 10);
  const role = email.includes("admin") ? "admin" : "pengguna";
  const akunBaru = {
    id: Date.now().toString(),
    nama,
    email,
    kataSandi: kataSandiEnkripsi,
    role,
    online: "tidak",
    terakhirDilihat: new Date().toISOString(),
  };

  await tambahBaris("Pengguna", akunBaru);
  delete kodeVerifikasi[email];

  const token = jwt.sign({ id: akunBaru.id }, process.env.JWT_RAHASIA, {
    expiresIn: "7d",
  });
  res.json({
    berhasil: true,
    token,
    pengguna: { ...akunBaru, kataSandi: undefined },
  });
});

app.post("/login", async (req, res) => {
  const { email, kataSandi } = req.body;
  const semuaPengguna = await bacaSheet("Pengguna");
  const akun = semuaPengguna.find((u) => u.email === email);

  if (!akun)
    return res.json({ berhasil: false, pesan: "❌ Email tidak ditemukan" });

  const cocok = await bcrypt.compare(kataSandi, akun.kataSandi);
  if (!cocok)
    return res.json({ berhasil: false, pesan: "❌ Kata sandi salah" });

  const token = jwt.sign({ id: akun.id }, process.env.JWT_RAHASIA, {
    expiresIn: "7d",
  });
  res.json({
    berhasil: true,
    token,
    pengguna: { ...akun, kataSandi: undefined },
  });
});

app.get("/pengguna", async (req, res) => {
  const semuaPengguna = await bacaSheet("Pengguna");
  res.json(
    semuaPengguna.map((u) => ({
      ...u,
      online: u.online === "ya",
      kataSandi: undefined,
    })),
  );
});

async function kirimStatusPengguna() {
  const semua = await bacaSheet("Pengguna");
  io.emit(
    "status-pengguna",
    semua.map((u) => ({
      ...u,
      online: u.online === "ya",
      kataSandi: undefined,
    })),
  );
}

io.on("connection", (soket) => {
  console.log("🔌 Terhubung:", soket.id);
  const idPengguna = soket.handshake.query.idPengguna;

  soket.on("masuk", async (id) => {
    await perbaruiKolom("Pengguna", "id", id, "online", "ya");
    kirimStatusPengguna();
  });

  soket.on("kirim-pesan", async (data) => {
    const pesanSimpan = {
      id: Date.now().toString(),
      pengirimId: data.pengirimId,
      penerimaId: data.penerimaId,
      isi: data.isi,
      waktu: data.waktu,
      dibaca: "tidak",
      jenis: "teks",
    };
    await tambahBaris("Pesan", pesanSimpan);
    io.to(data.penerimaId).to(data.pengirimId).emit("pesan-baru", data);
  });

  soket.on("permintaan-pesan", async (pasanganId) => {
    const semuaPesan = await bacaSheet("Pesan");
    const riwayat = semuaPesan
      .filter(
        (p) =>
          (p.pengirimId === idPengguna && p.penerimaId === pasanganId) ||
          (p.pengirimId === pasanganId && p.penerimaId === idPengguna),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    soket.emit("riwayat-pesan", riwayat);
  });

  soket.on("disconnect", async () => {
    if (idPengguna) {
      await perbaruiKolom("Pengguna", "id", idPengguna, "online", "tidak");
      await perbaruiKolom(
        "Pengguna",
        "id",
        idPengguna,
        "terakhirDilihat",
        new Date().toISOString(),
      );
      kirimStatusPengguna();
    }
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Aplikasi Berjalan di http://localhost:3000");
  console.log("📊 Basis Data: Google Sheets");
});
