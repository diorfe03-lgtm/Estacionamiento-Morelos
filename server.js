const express = require("express");
const cors = require("cors");
const { v4: uuid } = require("uuid");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// 🔑 SUPABASE - Asegúrate de tener estas variables en Render
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// 🕒 UTILIDADES DE FECHA
function fechaCDMX(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Mexico_City",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function horaCDMX(iso) {
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    hour: "2-digit", minute: "2-digit",
  });
}

function calcularMonto(horaEntrada) {
  const entrada = new Date(horaEntrada);
  const now = new Date();
  const mins = Math.ceil((now - entrada) / 60000);
  let monto = 15; // Primera hora
  if (mins > 60) {
    monto += Math.ceil((mins - 60) / 20) * 5;
  }
  return monto;
}

// ➕ CREAR BOLETO
app.post("/ticket", async (req, res) => {
  const { placas, marca, modelo, color } = req.body;
  if (!placas) return res.status(400).json({ error: "Faltan placas" });

  const id = uuid();
  const now = new Date();

  const { error } = await supabase.from("tickets").insert([{
    id,
    fecha: fechaCDMX(now),
    placas: placas.trim(),
    marca, modelo, color,
    hora_entrada: now.toISOString(),
    cobrado: false
  }]);

  if (error) return res.status(500).json({ error: "Error DB" });
  res.json({ id });
});

// 🔍 CONSULTAR BOLETO
app.get("/ticket/:id", async (req, res) => {
  const { data: t, error } = await supabase.from("tickets").select("*").eq("id", req.params.id).single();
  if (error || !t) return res.json({ error: "No encontrado" });
  if (t.cobrado) return res.json({ error: "Ya fue cobrado" });

  res.json({
    placas: t.placas,
    hora_entrada_cdmx: horaCDMX(t.hora_entrada),
    monto: calcularMonto(t.hora_entrada)
  });
});

// 💰 PAGO
app.post("/pay/:id", async (req, res) => {
  const { data: t } = await supabase.from("tickets").select("*").eq("id", req.params.id).single();
  const monto = calcularMonto(t.hora_entrada);
  await supabase.from("tickets").update({
    cobrado: true,
    hora_salida: new Date().toISOString(),
    monto: monto
  }).eq("id", req.params.id);
  res.json({ success: true });
});

// 📊 CORTE
app.post("/corte-caja", async (req, res) => {
  if (req.body.password !== "1234") return res.status(401).json({ error: "Mal" });
  const { data } = await supabase.from("tickets").select("monto").eq("fecha", fechaCDMX()).eq("cobrado", true);
  const total = data.reduce((sum, t) => sum + Number(t.monto), 0);
  res.json({ total, boletos: data.length });
});

// 🌐 SERVIR FRONTEND
app.use(express.static(path.join(__dirname, "public")));
app.get("(.*)", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor en puerto " + PORT));

//vamos a poner este comentario para volver a reinciar el build