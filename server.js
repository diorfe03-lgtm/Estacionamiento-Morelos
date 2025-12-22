const express = require("express");
const cors = require("cors");
const { v4: uuid } = require("uuid");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// 🔑 SUPABASE
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 🧮 FUNCIÓN ÚNICA DE COBRO
function calcularMonto(horaEntrada) {
  const entrada = new Date(horaEntrada);
  const now = new Date();
  const diffMs = now - entrada;
  const totalMinutes = Math.ceil(diffMs / 60000);
  let monto = 15;
  if (totalMinutes > 60) {
    const extraMinutes = totalMinutes - 60;
    const bloques20 = Math.ceil(extraMinutes / 20);
    monto += bloques20 * 5;
  }
  return monto;
}

// ➕ CREAR BOLETO
app.post("/ticket", async (req, res) => {
  const id = uuid();
  const now = new Date();
  const fecha = now.toISOString().slice(0, 10);

  const { error } = await supabase.from("tickets").insert([{
    id,
    fecha,
    marca: req.body.marca || "",
    modelo: req.body.modelo || "",
    color: req.body.color || "",
    placas: req.body.placas || "",
    hora_entrada: now.toISOString(),
    cobrado: false
  }]);

  if (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al crear boleto" });
  }

  res.json({ id });
});

// 🔍 CONSULTAR BOLETO + COBRO
app.get("/ticket/:id", async (req, res) => {
  const { data: ticket, error } = await supabase
    .from("tickets")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error || !ticket) return res.json({ error: "Boleto no existe" });
  if (ticket.cobrado) return res.json({ error: "Este boleto ya fue cobrado" });

  const monto = calcularMonto(ticket.hora_entrada);
  res.json({ ...ticket, monto });
});

// 💰 CONFIRMAR PAGO
app.post("/pay/:id", async (req, res) => {
  const { data: ticket } = await supabase
    .from("tickets")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (!ticket) return res.json({ message: "No existe" });
  if (ticket.cobrado) return res.json({ message: "Ya estaba cobrado" });

  const monto = calcularMonto(ticket.hora_entrada);
  const now = new Date();

  await supabase.from("tickets")
    .update({ cobrado: true, hora_salida: now.toISOString(), monto })
    .eq("id", req.params.id);

  res.json({ message: "Pago registrado correctamente", monto });
});

// 📊 TOTAL POR DÍA
app.get("/total/:fecha", async (req, res) => {
  const { data } = await supabase
    .from("tickets")
    .select("monto")
    .eq("fecha", req.params.fecha)
    .eq("cobrado", true);

  const total = data.reduce((sum, t) => sum + Number(t.monto), 0);
  res.json({ fecha: req.params.fecha, total, boletos: data.length });
});

// 🌐 SERVIR FRONTEND
app.use(express.static(path.join(__dirname, "public"))); // carpeta 'public' para index.html

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor activo en el puerto ${PORT}`);
});
