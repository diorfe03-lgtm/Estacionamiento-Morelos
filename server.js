const express = require("express");
const cors = require("cors");
const { v4: uuid } = require("uuid");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// 🔑 CONFIGURACIÓN DE SUPABASE
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// 🕒 UTILIDADES DE FECHA Y HORA (CDMX)
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
    hour12: true
  });
}

// 🧮 LÓGICA DE COBRO Y TIEMPO
function calcularDetalleCobro(horaEntrada) {
  const entrada = new Date(horaEntrada);
  const ahora = new Date();
  const diffMs = (ahora - entrada);
  const minsTotales = Math.ceil(diffMs / 60000);

  // Regla: 15 pesos la primera hora, luego 5 pesos por cada 20 min adicionales
  let monto = 15;
  if (minsTotales > 60) {
    monto += Math.ceil((minsTotales - 60) / 20) * 5;
  }

  const horasDisp = Math.floor(minsTotales / 60);
  const minsDisp = minsTotales % 60;

  return {
    monto,
    tiempo: `${horasDisp}h ${minsDisp}m`,
    ahoraISO: ahora.toISOString()
  };
}

// --- RUTAS DEL API ---

// ➕ 1. CREAR NUEVO BOLETO
app.post("/ticket", async (req, res) => {
  const { placas, marca, modelo, color } = req.body;

  if (!placas?.trim()) {
    return res.status(400).json({ error: "Las placas son obligatorias" });
  }

  const id = uuid();
  const now = new Date();

  const { error } = await supabase.from("tickets").insert([{
    id,
    fecha: fechaCDMX(now),
    placas: placas.trim().toUpperCase(),
    marca: marca?.trim() || "----",
    modelo: modelo?.trim() || "----",
    color: color?.trim() || "----",
    hora_entrada: now.toISOString(),
    cobrado: false
  }]);

  if (error) return res.status(500).json({ error: error.message });
  
  res.json({ id });
});

// 🔍 2. CONSULTAR BOLETO (Para el Front de cobro)
app.get("/ticket/:id", async (req, res) => {
  const { data: t, error } = await supabase
    .from("tickets")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error || !t) return res.status(404).json({ error: "Boleto no encontrado" });
  if (t.cobrado) return res.status(400).json({ error: "Este boleto ya fue pagado" });

  const detalle = calcularDetalleCobro(t.hora_entrada);

  res.json({
    placas: t.placas,
    horaEntrada: horaCDMX(t.hora_entrada),
    monto: detalle.monto,
    tiempo: detalle.tiempo
  });
});

// 💰 3. CONFIRMAR PAGO Y SALIDA
app.post("/pay/:id", async (req, res) => {
  const { data: t } = await supabase
    .from("tickets")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (!t || t.cobrado) return res.status(400).json({ error: "Transacción no válida" });

  const detalle = calcularDetalleCobro(t.hora_entrada);

  const { error } = await supabase.from("tickets")
    .update({
      cobrado: true,
      hora_salida: detalle.ahoraISO,
      monto: detalle.monto
    })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: "Error al procesar pago" });

  res.json({
    placas: t.placas,
    horaEntrada: horaCDMX(t.hora_entrada),
    horaSalida: horaCDMX(detalle.ahoraISO),
    monto: detalle.monto
  });
});

// 🌐 SERVIR FRONTEND (Archivos estáticos)
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// INICIO DEL SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});