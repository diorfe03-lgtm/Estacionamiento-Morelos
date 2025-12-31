const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

process.env.TZ = "America/Mexico_City";

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function generarIdCorto() {
  const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let resultado = "";
  for (let i = 0; i < 6; i++) {
    resultado += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
  }
  return resultado;
}

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
  
  const id = generarIdCorto();
  const now = new Date(); 
  const hoy = fechaCDMX(now);

  try {
    const { count, error: countError } = await supabase
      .from("tickets")
      .select('id', { count: 'exact', head: true })
      .eq("fecha", hoy);

    if (countError) throw countError;

    const nuevoFolio = (count || 0) + 1;

    const { data, error } = await supabase.from("tickets").insert([{
      id,
      fecha: hoy,
      placas: placas.trim().toUpperCase(),
      marca: marca || "", 
      modelo: modelo || "", 
      color: color || "", 
      hora_entrada: now.toISOString(), 
      cobrado: false,
      folio_diario: nuevoFolio
    }]).select();

    if (error) throw error;
    
    res.json({ 
      id: data[0].id, 
      hora_entrada: now.getTime(),
      folio: nuevoFolio 
    });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// NUEVA RUTA: Buscar boleto activo por placa (Boleto Perdido)
app.get("/ticket/placa/:placa", async (req, res) => {
  const { placa } = req.params;
  try {
    const { data: t, error } = await supabase
      .from("tickets")
      .select("id")
      .eq("placas", placa.toUpperCase())
      .eq("cobrado", false)
      .order('hora_entrada', { ascending: false })
      .limit(1)
      .single();

    if (error || !t) return res.status(404).json({ error: "No se encontró un boleto activo para esta placa" });
    res.json({ id: t.id });
  } catch (e) {
    res.status(500).json({ error: "Error en el servidor" });
  }
});

app.get("/ticket/:id", async (req, res) => {
  const { data: t, error } = await supabase.from("tickets")
    .select("*")
    .eq("id", req.params.id.toUpperCase())
    .single();

  if (error || !t) return res.status(404).json({ error: "No encontrado" });
  if (t.cobrado) return res.status(400).json({ error: "Este boleto ya fue pagado" });
  
  res.json({ 
    placas: t.placas, 
    monto: calcularMonto(t.hora_entrada) 
  });
});

app.post("/pay/:id", async (req, res) => {
  const { data: t } = await supabase.from("tickets").select("*").eq("id", req.params.id.toUpperCase()).single();
  if(!t) return res.status(404).json({ error: "No encontrado" });

  const monto = calcularMonto(t.hora_entrada);
  await supabase.from("tickets").update({
    cobrado: true, 
    hora_salida: new Date().toISOString(), 
    monto: monto
  }).eq("id", req.params.id.toUpperCase());

  res.json({ success: true });
});

app.post("/corte-caja", async (req, res) => {
  if (req.body.password !== "1234") return res.status(401).json({ error: "Incorrecto" });
  
  const { data, error } = await supabase.from("tickets")
    .select("monto")
    .eq("fecha", fechaCDMX())
    .eq("cobrado", true);

  if (error) return res.status(500).json({ error: "Error DB" });
  
  const total = data.reduce((sum, t) => sum + Number(t.monto || 0), 0);
  res.json({ total, boletos: data.length });
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor iniciado en puerto " + PORT));