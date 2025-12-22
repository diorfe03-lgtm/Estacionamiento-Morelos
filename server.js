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

// 🕒 FECHAS CDMX
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

// 🧮 COBRO
function calcularMonto(horaEntrada) {
  const entrada = new Date(horaEntrada);
  const now = new Date();
  const mins = Math.ceil((now - entrada) / 60000);

  let monto = 15;
  if (mins > 60) monto += Math.ceil((mins - 60) / 20) * 5;
  return monto;
}

// ➕ NUEVO BOLETO
app.post("/ticket", async (req, res) => {
  if (!req.body.placas?.trim()) {
    return res.status(400).json({ error: "Placas obligatorias" });
  }

  const id = uuid();
  const now = new Date();

  await supabase.from("tickets").insert([{
    id,
    fecha: fechaCDMX(now),
    placas: req.body.placas,
    marca: req.body.marca || "----",
    modelo: req.body.modelo || "----",
    color: req.body.color || "----",
    hora_entrada: now.toISOString(),
    cobrado: false
  }]);

  res.json({ id });
});

// 🔍 CONSULTAR BOLETO
app.get("/ticket/:id", async (req, res) => {
  const { data: t } = await supabase
    .from("tickets")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (!t) return res.json({ error: "Boleto no existe" });
  if (t.cobrado) return res.json({ error: "Ya cobrado" });

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
  if (ticket.cobrado) return res.json({ message: "Ya estaba cobrado" });

  const monto = calcularMonto(ticket.hora_entrada);
  const now = new Date();

  const { error } = await supabase.from("tickets")
    .update({
      cobrado: true,
      hora_salida: now.toISOString(),
      monto: monto
    })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: "Error al registrar pago" });

  res.json({
    message: "Pago registrado correctamente",
    monto,
    hora_salida_cdmx: horaCDMX(now.toISOString())
  });
});

// 🌐 FRONT
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_, res) =>
  res.sendFile(path.join(__dirname, "public/index.html"))
);

app.get("/ping", (_, res) => res.send("pong"));

app.listen(process.env.PORT || 3000);
