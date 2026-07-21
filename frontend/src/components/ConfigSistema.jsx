import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { registrarAccion } from "../services/auditService";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

const CONFIG_DEFAULT = {
  nombreMunicipalidad: "WEB-MUNICIPAL",
  direccionMunicipal: "Plataforma Digital de Trámites Municipales",
  telefonoMunicipal: "N/A",
  correoMunicipal: "webmunicipal01@gmail.com",
  rucMunicipal: "20456789012",

  montoTramite: 3,
  vigenciaLicencia: 365,
  diasParaRenovacion: 30,
  maxReobservaciones: 2,
  diasPlazoReparo: 5,
  diasReprogramacion: 3,

  estadosLicencia: [
    "En revision",
    "Pago pendiente",
    "Inspección programada",
    "En inspección",
    "Resultado enviado al funcionario",
    "Observada - Pendiente de reparo",
    "Licencia aprobada",
    "Licencia rechazada",
    "Licencia vencida",
  ],

  tiposNegocio: [
    "Comercio", "Restaurante", "Servicios", "Industria",
    "Minería", "Educación", "Salud", "Otro",
  ],

  categoriasEmpresa: [
    "Microempresa", "Pequeña empresa", "Mediana empresa", "Gran empresa",
  ],

  horasInspeccion: [
    "08:00", "09:00", "10:00", "11:00", "12:00",
    "14:00", "15:00", "16:00", "17:00",
  ],
};

function ConfigSistema() {
  const { usuario } = useAuth();
  const [config, setConfig] = useState(CONFIG_DEFAULT);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [pestana, setPestana] = useState("general");

  useEffect(() => {
    cargar();
  }, []);

  const cargar = async () => {
    try {
      const ref = doc(db, "config_sistema", "general");
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setConfig({ ...CONFIG_DEFAULT, ...snap.data() });
      }
    } catch (err) {
      console.error("Error cargando config:", err);
    }
  };

  const guardar = async () => {
    setGuardando(true);
    setMensaje("");
    try {
      const ref = doc(db, "config_sistema", "general");
      await setDoc(ref, {
        ...config,
        actualizadoPor: usuario.nombre,
        actualizadoEn: serverTimestamp(),
      });

      await registrarAccion({
        usuario: usuario.nombre,
        usuarioId: usuario.uid,
        accion: "Actualizar configuración del sistema",
        detalle: `Modificó parámetros generales del sistema`,
      });

      setMensaje("Configuración guardada correctamente.");
      setTimeout(() => setMensaje(""), 3000);
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  const actualizarCampo = (campo, valor) => {
    setConfig({ ...config, [campo]: valor });
  };


  return (
    <div>
      <div className="admin-module-header">
        <div>
          <h2>Configuración del Sistema</h2>
          <p>Parámetros generales, precios, estados y horarios del sistema municipal.</p>
        </div>
        <button type="button" className="btn-primary" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>

      {mensaje && (
        <div className="config-success-msg">{mensaje}</div>
      )}

      <div className="config-tabs">
        <button type="button" className={pestana === "general" ? "active" : ""} onClick={() => setPestana("general")}>General</button>
        <button type="button" className={pestana === "tramite" ? "active" : ""} onClick={() => setPestana("tramite")}>Trámite</button>
        <button type="button" className={pestana === "estados" ? "active" : ""} onClick={() => setPestana("estados")}>Estados</button>
        <button type="button" className={pestana === "horarios" ? "active" : ""} onClick={() => setPestana("horarios")}>Horarios</button>
      </div>

      {pestana === "general" && (
        <div className="config-section">
          <h3>Datos de la Municipalidad</h3>
          <div className="config-grid">
            <div><label>Nombre</label><input type="text" value={config.nombreMunicipalidad} onChange={(e) => actualizarCampo("nombreMunicipalidad", e.target.value)} /></div>
            <div><label>Dirección</label><input type="text" value={config.direccionMunicipal} onChange={(e) => actualizarCampo("direccionMunicipal", e.target.value)} /></div>
            <div><label>Teléfono</label><input type="text" value={config.telefonoMunicipal} onChange={(e) => actualizarCampo("telefonoMunicipal", e.target.value)} /></div>
            <div><label>Correo</label><input type="email" value={config.correoMunicipal} onChange={(e) => actualizarCampo("correoMunicipal", e.target.value)} /></div>
            <div><label>RUC</label><input type="text" value={config.rucMunicipal} onChange={(e) => actualizarCampo("rucMunicipal", e.target.value)} /></div>
          </div>
        </div>
      )}

      {pestana === "tramite" && (
        <div className="config-section">
          <h3>Parámetros del Trámite</h3>
          <div className="config-grid">
            <div>
              <label>Monto del trámite (S/)</label>
              <input type="number" step="0.01" min="0" value={config.montoTramite} onChange={(e) => actualizarCampo("montoTramite", parseFloat(e.target.value) || 0)} />
              <small>Monto que paga el solicitante por el derecho de trámite</small>
            </div>
            <div>
              <label>Vigencia de licencia (días)</label>
              <input type="number" min="1" value={config.vigenciaLicencia} onChange={(e) => actualizarCampo("vigenciaLicencia", parseInt(e.target.value) || 365)} />
              <small>Duración de la licencia en días</small>
            </div>
            <div>
              <label>Días antes de vencimiento para renovar</label>
              <input type="number" min="1" value={config.diasParaRenovacion} onChange={(e) => actualizarCampo("diasParaRenovacion", parseInt(e.target.value) || 30)} />
            </div>
            <div>
              <label>Maximo de reobservaciones</label>
              <input type="number" min="1" max="3" value={config.maxReobservaciones} onChange={(e) => actualizarCampo("maxReobservaciones", parseInt(e.target.value) || 2)} />
              <small>Número maximo de reobservaciones antes del rechazo definitivo</small>
            </div>
            <div>
              <label>Días plazo para reparo</label>
              <input type="number" min="1" value={config.diasPlazoReparo} onChange={(e) => actualizarCampo("diasPlazoReparo", parseInt(e.target.value) || 30)} />
              <small>Días que tiene el negocio para corregir observaciones</small>
            </div>
          </div>
        </div>
      )}

      {pestana === "estados" && (
        <div className="config-section">
          <h3>Estados de Licencia</h3>
          <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "16px" }}>Estados disponibles en el ciclo de vida de una solicitud.</p>
          <div className="config-list-edit">
            {config.estadosLicencia.map((estado, i) => (
              <div key={i} className="config-list-item">
                <span className="config-list-num">{i + 1}</span>
                <input type="text" value={estado} onChange={(e) => {
                  const nuevos = [...config.estadosLicencia];
                  nuevos[i] = e.target.value;
                  actualizarCampo("estadosLicencia", nuevos);
                }} />
                <button type="button" className="btn-sm btn-danger" onClick={() => {
                  actualizarCampo("estadosLicencia", config.estadosLicencia.filter((_, j) => j !== i));
                }}>&#10005;</button>
              </div>
            ))}
            <button type="button" className="btn-sm btn-outline" onClick={() => actualizarCampo("estadosLicencia", [...config.estadosLicencia, "Nuevo estado"])}>
              + Agregar estado
            </button>
          </div>

          <h3 style={{ marginTop: "24px" }}>Tipos de Negocio</h3>
          <div className="config-tags">
            {config.tiposNegocio.map((t, i) => (
              <span key={i} className="config-tag">
                {t}
                <button type="button" onClick={() => actualizarCampo("tiposNegocio", config.tiposNegocio.filter((_, j) => j !== i))}>&#10005;</button>
              </span>
            ))}
          </div>
          <input type="text" placeholder="Agregar tipo (Enter para agregar)" onKeyDown={(e) => {
            if (e.key === "Enter" && e.target.value.trim()) {
              actualizarCampo("tiposNegocio", [...config.tiposNegocio, e.target.value.trim()]);
              e.target.value = "";
            }
          }} style={{ marginTop: "8px" }} />

          <h3 style={{ marginTop: "24px" }}>Categorias de Empresa</h3>
          <div className="config-tags">
            {config.categoriasEmpresa.map((c, i) => (
              <span key={i} className="config-tag">
                {c}
                <button type="button" onClick={() => actualizarCampo("categoriasEmpresa", config.categoriasEmpresa.filter((_, j) => j !== i))}>&#10005;</button>
              </span>
            ))}
          </div>
          <input type="text" placeholder="Agregar categoria (Enter para agregar)" onKeyDown={(e) => {
            if (e.key === "Enter" && e.target.value.trim()) {
              actualizarCampo("categoriasEmpresa", [...config.categoriasEmpresa, e.target.value.trim()]);
              e.target.value = "";
            }
          }} style={{ marginTop: "8px" }} />
        </div>
      )}

      {pestana === "horarios" && (
        <div className="config-section">
          <h3>Horarios de Inspección</h3>
          <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "16px" }}>Horarios disponibles para programar inspecciones.</p>
          <div className="config-horas-grid">
            {config.horasInspeccion.map((h, i) => (
              <div key={i} className="config-hora-item">
                <span>{h}</span>
                <button type="button" onClick={() => actualizarCampo("horasInspeccion", config.horasInspeccion.filter((_, j) => j !== i))}>&#10005;</button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
            <input type="time" id="nuevaHora" style={{ flex: 1 }} />
            <button type="button" className="btn-sm btn-primary" onClick={() => {
              const input = document.getElementById("nuevaHora");
              if (input.value) {
                actualizarCampo("horasInspeccion", [...config.horasInspeccion, input.value].sort());
                input.value = "";
              }
            }}>Agregar hora</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConfigSistema;
