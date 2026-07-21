function Timeline({ solicitud }) {
  if (!solicitud) return null;

  const pasos = [
    {
      titulo: "Solicitud creada",
      desc: `Canal: ${solicitud.canalRegistro === "presencial" ? "Presencial" : "Online"}`,
      fecha: solicitud.fecha,
      estado: "completado",
    },
    {
      titulo: "Documentos adjuntados",
      desc: solicitud.archivoNombre || "Sin archivos",
      fecha: solicitud.fecha,
      estado: "completado",
    },
    {
      titulo: "Pago del derecho de tramite",
      desc: solicitud.estadoPago === "Confirmado"
        ? `S/${solicitud.montoPagado || 3}.00 - ${solicitud.metodoPago || "Pagado"}`
        : solicitud.estadoPago || "Pendiente",
      fecha: solicitud.estadoPago === "Confirmado" ? solicitud.fecha : "",
      estado: solicitud.estadoPago === "Confirmado" ? "completado" : "pendiente",
    },
    {
      titulo: "Validacion de pago",
      desc: solicitud.estadoPago === "Confirmado" ? "Pago verificado correctamente" : "Esperando confirmacion",
      fecha: solicitud.estadoPago === "Confirmado" ? solicitud.fecha : "",
      estado: solicitud.estadoPago === "Confirmado" ? "completado" : "pendiente",
    },
  ];

  if (solicitud.fechaVisitaInspector) {
    pasos.push({
      titulo: "Inspección programada",
      desc: `Fecha: ${solicitud.fechaVisitaInspector} a las ${solicitud.horaVisitaInspector || "08:00"}`,
      fecha: solicitud.fechaVisitaInspector,
      estado: ["Aprobada", "Completada"].includes(solicitud.inspeccion)
        ? "completado"
        : ["Reobservada", "Observada", "Rechazada"].includes(solicitud.inspeccion)
          ? "rechazado"
          : "activo",
    });
  }

  if (["Aprobada", "Completada", "Reobservada", "Observada", "Rechazada"].includes(solicitud.inspeccion)) {
    pasos.push({
      titulo: "Inspección realizada",
      desc: solicitud.resultadoInspeccion || solicitud.inspeccion,
      fecha: solicitud.fechaInspeccion || "",
      estado: ["Reobservada", "Observada", "Rechazada"].includes(solicitud.inspeccion) ? "rechazado" : "completado",
    });
  }

  if (solicitud.cantidadReobservaciones > 0) {
    pasos.push({
      titulo: `Reobservación (${solicitud.cantidadReobservaciones})`,
      desc: solicitud.observacionInspector || "Observaciones del inspector",
      fecha: solicitud.historialReobservaciones?.[solicitud.historialReobservaciones.length - 1]?.fecha || "",
      estado: "rechazado",
    });
  }

  if (solicitud.decisionFuncionario || ["Aprobado", "Licencia emitida", "Rechazado"].includes(solicitud.estado)) {
    const isApproved = ["Aprobada", "Aprobado", "Aprobado (Licencia emitida)"].includes(solicitud.decisionFuncionario) || ["Aprobado", "Licencia emitida"].includes(solicitud.estado);
    pasos.push({
      titulo: "Decisión del funcionario",
      desc: isApproved
        ? "Aprobado para emisión de licencia municipal"
        : `Rechazado - Motivo: ${solicitud.observacionFuncionario || "Reobservación superada"}`,
      fecha: solicitud.fechaDecisionFuncionario || "",
      estado: isApproved ? "completado" : "rechazado",
    });
  }

  if (solicitud.numeroLicencia || ["Licencia emitida"].includes(solicitud.estado)) {
    pasos.push({
      titulo: "Licencia emitida",
      desc: `N° ${solicitud.numeroLicencia || "LIC-GENERANDO"} - Vence: ${solicitud.fechaExpiracionLicencia || "N/A"}`,
      fecha: solicitud.fechaAprobacion || "",
      estado: "completado",
    });
  }

  return (
    <div className="timeline-modern">
      {pasos.map((paso, i) => (
        <div className="timeline-step-modern" key={i}>
          <div className={`timeline-dot-modern ${paso.estado}`} />
          <div className="timeline-content-modern">
            <h4>{paso.titulo}</h4>
            <p>{paso.desc}</p>
            {paso.fecha && (
              <span style={{ fontSize: "11px", color: "#94a3b8", display: "inline-block", marginTop: "4px" }}>
                &#128197; {paso.fecha}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default Timeline;
