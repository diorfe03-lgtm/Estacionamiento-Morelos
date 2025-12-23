const express = require("express");
const cors = require("cors");
const { v4: uuid } = require("uuid");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// 🔑 SUPABASE
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
    monto += Math.ceil((mins - 60) / 20) * 5;
  }
  return monto;
}

// ➕ CREAR BOLETO (Placas obligatorias)
app.post("/ticket", async (req, res) => {
  const { placas, marca, modelo, color } = req.body;

  if (!placas || placas.trim() === "") {
    return res.status(400).json({ error: "Las placas son obligatorias" });
  }

  const id = uuid();
  const now = new Date();

  const { error } = await supabase.from("tickets").insert([{
    id,
    fecha: fechaCDMX(now),
    placas: placas.trim(),
    marca: marca || "----",
    modelo: modelo || "----",
    color: color || "----",
    hora_entrada: now.toISOString(),
    cobrado: false
  }]);

  if (error) return res.status(500).json({ error: "Error en DB" });
  res.json({ id });
});

// 🔍 CONSULTAR BOLETO
app.get("/ticket/:id", async (req, res) => {
  const { data: t, error } = await supabase
    .from("tickets")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error || !t) return res.json({ error: "Boleto no existe" });
  if (t.cobrado) return res.json({ error: "Este boleto ya fue cobrado" });

  const ahora = new Date().toISOString();

  res.json({
    placas: t.placas,
    hora_entrada_cdmx: horaCDMX(t.hora_entrada),
    hora_salida_cdmx: horaCDMX(ahora),
    monto: calcularMonto(t.hora_entrada)
  });
});

// 💰 CONFIRMAR PAGO
app.post("/pay/:id", async (req, res) => {
  const { data: ticket } = await supabase.from("tickets").select("*").eq("id", req.params.id).single();
  if (!ticket) return res.status(404).json({ message: "No existe" });

  const monto = calcularMonto(ticket.hora_entrada);
  const now = new Date();

  await supabase.from("tickets").update({
    cobrado: true,
    hora_salida: now.toISOString(),
    monto: monto
  }).eq("id", req.params.id);

  res.json({ message: "Pago registrado", monto });
});

// 📊 CORTE DE CAJA PROTEGIDO
app.post("/corte-caja", async (req, res) => {
  const { password } = req.body;
  const PASSWORD_MAESTRA = "1234"; // 👈 Cambia tu contraseña aquí

  if (password !== PASSWORD_MAESTRA) {
    return res.status(401).json({ error: "Clave incorrecta" });
  }

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
app.listen(process.env.PORT || 3000, () => console.log("Servidor Activo"));