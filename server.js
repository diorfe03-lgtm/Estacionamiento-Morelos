const express = require("express");
const cors = require("cors");
const { v4: uuid } = require("uuid");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

process.env.TZ = "America/Mexico_City";

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function fechaCDMX(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Mexico_City",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function calcularMonto(horaEntrada) {
  const entrada = new Date(horaEntrada);
  const ahora = new Date(); 
  const minsTotales = Math.floor((ahora - entrada) / 60000);
  
  if (minsTotales <= 70) return 15;
  const minsExcedentes = minsTotales - 70;
  const bloquesExtra = Math.ceil(minsExcedentes / 20);
  return 15 + (bloquesExtra * 5);
}

app.post("/ticket", async (req, res) => {
  const { placas, marca, modelo, color } = req.body;
  if (!placas) return res.status(400).json({ error: "Faltan placas" });
  
  const id = uuid();
  const now = new Date(); 

  const { data, error } = await supabase.from("tickets").insert([{
    id, 
    fecha: fechaCDMX(now), 
    placas: placas.trim().toUpperCase(),
    marca: marca || "", 
    modelo: modelo || "", 
    color: color || "", 
    hora_entrada: now.toISOString(), 
    cobrado: false
  }]).select();

  if (error) return res.status(500).json({ error: "Error DB" });
  res.json({ id: data[0].id, hora_entrada: now.getTime() });
});

app.get("/ticket/:id", async (req, res) => {
  const { data: t, error } = await supabase.from("tickets").select("*").eq("id", req.params.id).single();
  if (error || !t) return res.status(404).json({ error: "No encontrado" });
  if (t.cobrado) return res.status(400).json({ error: "Ya fue pagado" });
  res.json({ placas: t.placas, monto: calcularMonto(t.hora_entrada) });
});

app.post("/pay/:id", async (req, res) => {
  const { data: t } = await supabase.from("tickets").select("*").eq("id", req.params.id).single();
  if(!t) return res.status(404).json({ error: "No encontrado" });
  const monto = calcularMonto(t.hora_entrada);
  await supabase.from("tickets").update({
    cobrado: true, hora_salida: new Date().toISOString(), monto: monto
  }).eq("id", req.params.id);
  res.json({ success: true });
});

app.post("/corte-caja", async (req, res) => {
  if (req.body.password !== "1234") return res.status(401).json({ error: "Incorrecto" });
  const { data, error } = await supabase.from("tickets").select("monto").eq("fecha", fechaCDMX()).eq("cobrado", true);
  if (error) return res.status(500).json({ error: "Error DB" });
  const total = data.reduce((sum, t) => sum + Number(t.monto || 0), 0);
  res.json({ total, boletos: data.length });
});

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => { res.sendFile(path.join(__dirname, "public", "index.html")); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor listo"));