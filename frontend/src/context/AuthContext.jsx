import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";

const AuthContext = createContext();

export const normalizarRol = (rolRaw, email = "") => {
  if (!rolRaw) {
    const emailLow = String(email).toLowerCase();
    if (emailLow.includes("cajer")) return "cajero";
    if (emailLow.includes("inspector") || emailLow.includes("insp")) return "inspector";
    if (emailLow.includes("admin")) return "administrador";
    if (emailLow.includes("func")) return "administrador";
    if (emailLow === "alessandropaul19@gmail.com") return "cajero";
    if (emailLow === "arodriguezr1020@gmail.com") return "inspector";
    if (emailLow === "medicitasapp01@gmail.com") return "administrador";
    return "cajero";
  }

  const r = String(rolRaw).toLowerCase().trim();
  if (r.includes("cajer")) return "cajero";
  if (r.includes("insp")) return "inspector";
  if (r.includes("admin")) return "administrador";
  if (r.includes("func")) return "administrador";
  if (r.includes("negoc") || r.includes("solic") || r.includes("ciudadan")) return "cajero";
  return r;
};

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  const handleUserRemoval = async (showAlert = false) => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Error signing out:", e);
    }
    localStorage.clear();
    sessionStorage.clear();
    setUsuario(null);
    if (showAlert) {
      alert("⚠️ Esta cuenta está inhabilitada. Contacte al administrador del sistema.");
    }
  };

  useEffect(() => {
    let unsubscribeUserDoc = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          const emailLow = (user.email || "").toLowerCase();
          const ref = doc(db, "usuarios", user.uid);
          let snap = await getDoc(ref);
          let docData = snap.exists() ? snap.data() : null;

          if (!docData && emailLow) {
            const q = query(collection(db, "usuarios"), where("correo", "==", emailLow));
            const snapQ = await getDocs(q);
            if (!snapQ.empty) {
              docData = snapQ.docs[0].data();
            }
          }

          if (docData) {
            if (docData.activo === false || docData.estado === "desactivado" || docData.estado === "inactivo") {
              await handleUserRemoval(true);
              return;
            }

            const rolFinal = normalizarRol(docData.rol, user.email);

            setUsuario({
              uid: user.uid,
              correo: user.email,
              nombre: docData.nombre || docData.nombre_completo || "Usuario",
              rol: rolFinal,
              telefono: docData.telefono || "",
              dni: docData.dni || "",
              activo: true,
              estado: "activo",
              recibir_correos: docData.recibir_correos !== false,
            });

            unsubscribeUserDoc = onSnapshot(ref, (docSnap) => {
              if (docSnap.exists()) {
                const updatedData = docSnap.data();

                if (updatedData.activo === false || updatedData.estado === "desactivado" || updatedData.estado === "inactivo") {
                  handleUserRemoval(true);
                  return;
                }

                setUsuario((prev) => ({
                  ...prev,
                  nombre: updatedData.nombre || updatedData.nombre_completo || prev?.nombre || "Usuario",
                  rol: normalizarRol(updatedData.rol, user.email),
                  telefono: updatedData.telefono || prev?.telefono || "",
                  dni: updatedData.dni || prev?.dni || "",
                }));
              }
            });
          } else {
            const rolInferido = normalizarRol("", emailLow);
            const nombreInferido = emailLow.includes("cajero")
              ? "Cajero Municipal"
              : emailLow.includes("funcionario")
              ? "Funcionario Municipal"
              : emailLow.includes("inspector")
              ? "Inspector Municipal"
              : emailLow.includes("admin")
              ? "Administrador General"
              : emailLow === "alessandropaul19@gmail.com"
              ? "Cajero Municipal"
              : emailLow === "arodriguezr1020@gmail.com"
              ? "Inspector Municipal"
              : emailLow === "medicitasapp01@gmail.com"
              ? "Administrador General"
              : "Usuario Solicitante";

            setUsuario({
              uid: user.uid,
              correo: user.email,
              nombre: nombreInferido,
              rol: rolInferido,
              telefono: "999888777",
              dni: "12345678",
              activo: true,
              estado: "activo",
              recibir_correos: true,
            });
          }
        } else {
          setUsuario(null);
        }
      } catch (error) {
        console.error("Error cargando usuario:", error);
      } finally {
        setCargando(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) unsubscribeUserDoc();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ usuario, setUsuario, cargando }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};