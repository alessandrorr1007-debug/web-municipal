import { useState } from "react";
import {
  PERMISOS_POR_ROL,
  ROL_ETIQUETAS,
  ROL_COLORES,
} from "../services/adminService";
import { registrarAccion } from "../services/auditService";
import { useAuth } from "../context/AuthContext";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

const TODOS_LOS_PERMISOS = [
  { id: "registrar_solicitudes_presenciales", modulo: "Cajero", descripcion: "Registrar solicitudes presenciales" },
  { id: "registrar_pagos", modulo: "Cajero", descripcion: "Registrar pagos en caja" },
  { id: "consultar_negocios", modulo: "Cajero", descripcion: "Consultar negocios registrados" },
  { id: "revisar_solicitudes", modulo: "Funcionario", descripcion: "Revisar solicitudes entrantes" },
  { id: "validar_documentos", modulo: "Funcionario", descripcion: "Validar documentos adjuntos" },
  {id: "aprobar_observar_tramites", modulo: "Funcionario", descripcion: "Aprobar o observar tramites" },
  { id: "programar_inspecciones", modulo: "Funcionario", descripcion: "Programar inspecciones" },
  { id: "ver_inspecciones_diarias", modulo: "Inspector", descripcion: "Ver inspecciones del dia" },
  { id: "registrar_resultados_inspeccion", modulo: "Inspector", descripcion: "Registrar resultados de inspeccion" },
  { id: "gestionar_usuarios", modulo: "Admin", descripcion: "Crear/editar/eliminar usuarios" },
  { id: "gestionar_roles", modulo: "Admin", descripcion: "Administrar roles y permisos" },
  { id: "ver_auditoria", modulo: "Admin", descripcion: "Ver historial de auditoria" },
  { id: "configurar_sistema", modulo: "Admin", descripcion: "Configurar parametros del sistema" },
  { id: "ver_estadisticas", modulo: "Admin", descripcion: "Ver estadisticas globales" },
  { id: "gestionar_solicitudes", modulo: "Admin", descripcion: "Gestionar todas las solicitudes" },
];

function GestionRoles({ onRecargar }) {
  const { usuario } = useAuth();
  const [permisosEditados, setPermisosEditados] = useState({});
  const [editandoRol, setEditandoRol] = useState(null);

  const getPermisos = (rol) => {
    return permisosEditados[rol] || PERMISOS_POR_ROL[rol] || [];
  };

  const togglePermiso = (rol, permisoId) => {
    const actuales = getPermisos(rol);
    const nuevos = actuales.includes(permisoId)
      ? actuales.filter((p) => p !== permisoId)
      : [...actuales, permisoId];
    setPermisosEditados({ ...permisosEditados, [rol]: nuevos });
  };

  const guardarPermisos = async (rol) => {
    const nuevosPermisos = permisosEditados[rol] || PERMISOS_POR_ROL[rol];
    try {
      const configRef = doc(db, "config_roles", rol);
      await setDoc(configRef, {
        permisos: nuevosPermisos,
        actualizadoPor: usuario.nombre,
        actualizadoEn: serverTimestamp(),
      });

      PERMISOS_POR_ROL[rol] = nuevosPermisos;

      await registrarAccion({
        usuario: usuario.nombre,
        usuarioId: usuario.uid,
        accion: "Actualizar permisos de rol",
        detalle: `Modifico permisos del rol ${ROL_ETIQUETAS[rol]}: ${nuevosPermisos.length} permisos`,
      });

      alert("Permisos guardados correctamente.");
      setEditandoRol(null);
      onRecargar();
    } catch (err) {
      alert("Error al guardar: " + err.message);
    }
  };

  const roles = ["cajero", "funcionario", "inspector", "administrador"];

  return (
    <div>
      <div className="admin-module-header">
        <div>
          <h2>Gestion de Roles y Permisos</h2>
          <p>Define que acciones puede realizar cada rol en el sistema.</p>
        </div>
      </div>

      <div className="roles-grid">
        {roles.map((rol) => (
          <div key={rol} className="role-card">
            <div className="role-card-header" style={{ borderTopColor: ROL_COLORES[rol] }}>
              <div className="role-icon" style={{ background: ROL_COLORES[rol] }}>
                {rol.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3>{ROL_ETIQUETAS[rol]}</h3>
                <p>{getPermisos(rol).length} permisos asignados</p>
              </div>
            </div>

            <div className="role-card-permisos">
              {TODOS_LOS_PERMISOS.filter((p) => {
                if (rol === "cajero") return p.modulo === "Cajero";
                if (rol === "funcionario") return p.modulo === "Funcionario";
                if (rol === "inspector") return p.modulo === "Inspector";
                if (rol === "administrador") return p.modulo === "Admin";
                return false;
              }).map((p) => (
                <label key={p.id} className={`role-permiso ${editandoRol === rol ? "editable" : ""}`}>
                  <input
                    type="checkbox"
                    checked={getPermisos(rol).includes(p.id)}
                    onChange={() => editandoRol === rol && togglePermiso(rol, p.id)}
                    disabled={editandoRol !== rol}
                  />
                  <span>{p.descripcion}</span>
                </label>
              ))}
            </div>

            <div className="role-card-footer">
              {editandoRol === rol ? (
                <>
                  <button type="button" className="btn-sm btn-outline" onClick={() => setEditandoRol(null)}>Cancelar</button>
                  <button type="button" className="btn-sm btn-primary" onClick={() => guardarPermisos(rol)}>Guardar</button>
                </>
              ) : (
                <button type="button" className="btn-sm btn-outline" onClick={() => setEditandoRol(rol)}>Editar permisos</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default GestionRoles;
