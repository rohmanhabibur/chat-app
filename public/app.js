let penggunaSaya = null;
let pasanganDipilih = null;
let soket = null;
let suaraNotifikasi = new Audio(
  "https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3",
);

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("aktif"));
    document
      .querySelectorAll(".isi-tab")
      .forEach((t) => t.classList.remove("aktif"));
    btn.classList.add("aktif");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("aktif");
    document.getElementById(
      `pesan-${btn.dataset.tab === "masuk" ? "masuk" : "daftar"}`,
    ).textContent = "";
  });
});

function bukaHalamanChat() {
  document.getElementById("kartu-auth").classList.add("tersembunyi");
  document.getElementById("halaman-chat").classList.remove("tersembunyi");
}

function bukaHalamanLogin() {
  document.getElementById("kartu-auth").classList.remove("tersembunyi");
  document.getElementById("halaman-chat").classList.add("tersembunyi");
}

async function kirimKode() {
  const email = document.getElementById("email-daftar").value.trim();
  const pesan = document.getElementById("pesan-daftar");
  if (!email || !email.includes("@")) {
    pesan.textContent = "⚠️ Email tidak valid";
    pesan.style.color = "#d93025";
    return;
  }
  try {
    const res = await fetch("/kirim-kode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    pesan.textContent = data.pesan;
    pesan.style.color = data.berhasil ? "#1e8e3e" : "#d93025";
  } catch {
    pesan.textContent = "❌ Gagal terhubung";
    pesan.style.color = "#d93025";
  }
}

async function daftar() {
  const nama = document.getElementById("nama-daftar").value.trim();
  const email = document.getElementById("email-daftar").value.trim();
  const sandi = document.getElementById("sandi-daftar").value;
  const kode = document.getElementById("kode-verifikasi").value.trim();
  const pesan = document.getElementById("pesan-daftar");

  if (!nama || !email || !sandi || !kode) {
    pesan.textContent = "⚠️ Lengkapi semua data";
    pesan.style.color = "#d93025";
    return;
  }
  if (sandi.length < 6) {
    pesan.textContent = "⚠️ Sandi minimal 6 karakter";
    pesan.style.color = "#d93025";
    return;
  }

  try {
    const res = await fetch("/daftar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nama, email, kataSandi: sandi, kode }),
    });
    const data = await res.json();
    if (data.berhasil) {
      simpanSesi(data.token, data.pengguna);
      masukAplikasi();
    } else {
      pesan.textContent = data.pesan;
      pesan.style.color = "#d93025";
    }
  } catch {
    pesan.textContent = "❌ Gagal terhubung";
    pesan.style.color = "#d93025";
  }
}

async function masuk() {
  const email = document.getElementById("email-masuk").value.trim();
  const sandi = document.getElementById("sandi-masuk").value;
  const pesan = document.getElementById("pesan-masuk");

  if (!email || !sandi) {
    pesan.textContent = "⚠️ Isi email & sandi";
    pesan.style.color = "#d93025";
    return;
  }

  try {
    const res = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, kataSandi: sandi }),
    });
    const data = await res.json();
    if (data.berhasil) {
      simpanSesi(data.token, data.pengguna);
      masukAplikasi();
    } else {
      pesan.textContent = data.pesan;
      pesan.style.color = "#d93025";
    }
  } catch {
    pesan.textContent = "❌ Gagal terhubung";
    pesan.style.color = "#d93025";
  }
}

function simpanSesi(token, akun) {
  localStorage.setItem("token", token);
  localStorage.setItem("pengguna", JSON.stringify(akun));
  penggunaSaya = akun;
}

function masukAplikasi() {
  bukaHalamanChat();
  document.getElementById("nama-saya").textContent = penggunaSaya.nama;
  document.getElementById("peran-saya").textContent =
    "Peran: " + penggunaSaya.role;

  soket = io({ query: { idPengguna: penggunaSaya.id } });
  soket.emit("masuk", penggunaSaya.id);
  soket.on("pesan-baru", tampilPesan);
  soket.on("status-pengguna", perbaruiDaftarPengguna);
  soket.on("pesan-dibaca", tandaiSudahDibaca);
  muatRiwayatPesan();
  muatDaftarPengguna();
}

function keluar() {
  if (confirm("Yakin keluar?")) {
    localStorage.clear();
    penggunaSaya = null;
    pasanganDipilih = null;
    bukaHalamanLogin();
  }
}

async function muatDaftarPengguna() {
  try {
    const res = await fetch("/pengguna");
    perbaruiDaftarPengguna(await res.json());
  } catch {}
}

function perbaruiDaftarPengguna(daftar) {
  const wadah = document.getElementById("daftar-pengguna");
  wadah.innerHTML = "";
  daftar
    .filter((u) => u.id !== penggunaSaya.id)
    .forEach((u) => {
      const el = document.createElement("div");
      el.innerHTML = `<strong>${u.nama}</strong><span class="indicator ${u.online ? "online" : "offline"}">● ${u.online ? "Online" : "Offline"}</span>`;
      el.onclick = () => pilihPengguna(u, el);
      wadah.appendChild(el);
    });
}

function pilihPengguna(pasangan, elemen) {
  document
    .querySelectorAll("#daftar-pengguna div")
    .forEach((d) => d.classList.remove("terpilih"));
  elemen.classList.add("terpilih");
  pasanganDipilih = pasangan;
  document.getElementById("nama-pasangan").textContent = pasangan.nama;
  document.getElementById("ruang-pesan").innerHTML = "";
  muatRiwayatPesan();
  soket.emit("tandai-terbaca", {
    pengirimId: pasangan.id,
    penerimaId: penggunaSaya.id,
  });
}

function kirimPesan() {
  if (!pasanganDipilih) return alert("⚠️ Pilih pengguna terlebih dahulu");
  const teks = document.getElementById("input-pesan").value.trim();
  if (!teks) return;

  const sekarang = new Date();
  const data = {
    id: Date.now(),
    pengirimId: penggunaSaya.id,
    penerimaId: pasanganDipilih.id,
    isi: teks,
    waktu: formatWaktu(sekarang),
    dibaca: false,
  };
  simpanKeRiwayat(data);
  soket.emit("kirim-pesan", data);
  tampilPesan(data);
  document.getElementById("input-pesan").value = "";
}

function tampilPesan(data) {
  const wadah = document.getElementById("ruang-pesan");
  const el = document.createElement("div");
  const adalahSaya = data.pengirimId === penggunaSaya.id;
  el.className = `pesan ${adalahSaya ? "saya" : "anda"}`;

  const tandaBaca = adalahSaya
    ? `<span class="tanda-baca ${data.dibaca ? "sudah" : "belum"}">${data.dibaca ? "✅" : "✦"}</span>`
    : "";

  el.innerHTML = `${data.isi}<br><small>${data.waktu} ${tandaBaca}</small>`;
  wadah.appendChild(el);
  wadah.scrollTop = wadah.scrollHeight;

  if (!adalahSaya) {
    putarSuaraNotifikasi();
    data.dibaca = true;
    soket.emit("tandai-terbaca", {
      pengirimId: penggunaSaya.id,
      penerimaId: pasanganDipilih?.id,
    });
  }
}

function tandaiSudahDibaca(data) {
  const semuaPesan = document.querySelectorAll(".pesan.saya .tanda-baca");
  semuaPesan.forEach((el) => {
    el.textContent = "✅";
    el.classList.remove("belum");
    el.classList.add("sudah");
  });
}

function formatWaktu(tanggal) {
  const h = tanggal.getHours().toString().padStart(2, "0");
  const m = tanggal.getMinutes().toString().padStart(2, "0");
  const hari = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"][
    tanggal.getDay()
  ];
  return `${hari}, ${h}:${m}`;
}

function putarSuaraNotifikasi() {
  suaraNotifikasi.volume = 0.3;
  suaraNotifikasi.currentTime = 0;
  suaraNotifikasi.play().catch(() => {});
}

function simpanKeRiwayat(data) {
  if (!pasanganDipilih) return;
  const kunci = `riwayat_${penggunaSaya.id}_${pasanganDipilih.id}`;
  let riwayat = JSON.parse(localStorage.getItem(kunci) || "[]");
  riwayat.push(data);
  if (riwayat.length > 100) riwayat = riwayat.slice(-100);
  localStorage.setItem(kunci, JSON.stringify(riwayat));
}

function muatRiwayatPesan() {
  if (!pasanganDipilih) return;
  const kunci = `riwayat_${penggunaSaya.id}_${pasanganDipilih.id}`;
  const riwayat = JSON.parse(localStorage.getItem(kunci) || "[]");
  document.getElementById("ruang-pesan").innerHTML = "";
  riwayat.forEach((pesan) => tampilPesan(pesan));
}

function jikaEnter(e) {
  if (e.key === "Enter") kirimPesan();
}

window.onload = () => {
  const tersimpan = localStorage.getItem("pengguna");
  if (tersimpan) {
    try {
      penggunaSaya = JSON.parse(tersimpan);
      masukAplikasi();
    } catch {
      localStorage.clear();
      bukaHalamanLogin();
    }
  } else {
    bukaHalamanLogin();
  }
};
