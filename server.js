const express = require("express");
const cors = require("cors");
const { v4: uuid } = require("uuid");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// 🔑 SUPABASE - Asegúrate de tener estas variables en tu entorno
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// 🕒 UTILIDADES DE FECHA (CDMX)
function fechaCDMX(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function horaCDMX(iso) {
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// 🧮 FUNCIÓN DE COBRO
function calcularMonto(horaEntrada) {
  const entrada = new Date(horaEntrada);
  const now = new Date();
  const mins = Math.ceil((now - entrada) / 60000);

  let monto = 15; // Primera hora
  if (mins > 60) {
    monto += Math.ceil((mins - 60) / 20) * 5; // Fracción de 20 min
  }
  return monto;
}

// ➕ CREAR BOLETO
app.post("/ticket", async (req, res) => {
  const id = uuid();
  const now = new Date();

  const { error } = await supabase.from("tickets").insert([{
    id,
    fecha: fechaCDMX(now),
    placas: req.body.placas || "----",
    marca: req.body.marca || "----",
    modelo: req.body.modelo || "----",
    color: req.body.color || "----",
    hora_entrada: now.toISOString(),
    cobrado: false
  }]);

  if (error) return res.status(500).json({ error: "Error en DB" });
  res.json({ id });
});

// 🔍 CONSULTAR BOLETO (Para cobrar)
app.get("/ticket/:id", async (req, res) => {
  const { data: t, error } = await supabase
    .from("tickets")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error || !t) return res.json({ error: "Boleto no existe" });
  if (t.cobrado) return res.json({ error: "Este boleto ya fue cobrado" });

  res.json({
    placas: t.placas,
    hora_entrada_cdmx: horaCDMX(t.hora_entrada),
    monto: calcularMonto(t.hora_entrada)
  });
});

// 💰 CONFIRMAR PAGO
app.post("/pay/:id", async (req, res) => {
  const { data: ticket } = await supabase
    .from("tickets")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (!ticket) return res.status(404).json({ message: "No existe" });
  
  const monto = calcularMonto(ticket.hora_entrada);
  const now = new Date();

  await supabase.from("tickets")
    .update({
      cobrado: true,
      hora_salida: now.toISOString(),
      monto: monto
    })
    .eq("id", req.params.id);

  res.json({ message: "Pago registrado", monto });
});

// 📊 CORTE DE CAJA (Solo hoy)
app.get("/corte-caja", async (req, res) => {
  const hoy = fechaCDMX();
  const { data, error } = await supabase
    .from("tickets")
    .select("monto")
    .eq("fecha", hoy)
    .eq("cobrado", true);

  if (error) return res.status(500).json({ error: "Error" });

  const total = data.reduce((sum, t) => sum + Number(t.monto), 0);
  res.json({ fecha: hoy, total, boletos: data.length });
});

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "public/index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor listo"));