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
      titulo: "Inspeccion programada",
      desc: `Fecha: ${solicitud.fechaVisitaInspector}${solicitud.nombreProgramador ? ` - Programado por: ${solicitud.nombreProgramador}` : ""}`,
      fecha: solicitud.fechaVisitaInspector,
      estado: solicitud.inspeccion === "Completada" ? "completado" : solicitud.inspeccion === "Observada" ? "rechazado" : "activo",
    });
  }

  if (solicitud.inspeccion === "Completada" || solicitud.inspeccion === "Observada") {
    pasos.push({
      titulo: "Inspeccion realizada",
      desc: solicitud.resultadoInspeccion || solicitud.inspeccion,
      fecha: solicitud.fechaInspeccion || "",
      estado: solicitud.inspeccion === "Observada" ? "rechazado" : "completado",
    });
  }

  if (solicitud.cantidadReobservaciones > 0) {
    pasos.push({
      titulo: `Reobservacion${solicitud.cantidadReobservaciones > 1 ? "es" : ""} (${solicitud.cantidadReobservaciones})`,
      desc: solicitud.observacionInspector || "Observaciones del inspector",
      fecha: solicitud.historialReobservaciones?.[solicitud.historialReobservaciones.length - 1]?.fecha || "",
      estado: solicitud.cantidadReobservaciones >= 2 ? "rechazado" : "rechazado",
    });
  }

  if (solicitud.decisionFuncionario) {
    pasos.push({
      titulo: "Decision del funcionario",
      desc: `${solicitud.decisionFuncionario}${solicitud.observacionFuncionario ? ` - ${solicitud.observacionFuncionario}` : ""}`,
      fecha: solicitud.fechaDecisionFuncionario || "",
      estado: solicitud.decisionFuncionario === "Aprobado" ? "completado" : "rechazado",
    });
  }

  if (solicitud.decisionFuncionario === "Aprobado" && solicitud.numeroLicencia) {
    pasos.push({
      titulo: "Licencia emitida",
      desc: `N° ${solicitud.numeroLicencia} - Vence: ${solicitud.fechaExpiracionLicencia || "N/A"}`,
      fecha: solicitud.fechaAprobacion || "",
      estado: "completado",
    });
  }

  return (
    <div className="timeline">
      {pasos.map((paso, i) => (
        <div className="timeline-item" key={i}>
          <div className="timeline-line">
            <div className={`timeline-dot ${paso.estado}`} />
            {i < pasos.length - 1 && (
              <div className={`timeline-connector ${paso.estado === "completado" ? "completed" : ""}`} />
            )}
          </div>
          <div className="timeline-content">
            <h4>{paso.titulo}</h4>
            <p>{paso.desc}</p>
            {paso.fecha && <div className="timeline-date">{paso.fecha}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default Timeline;
