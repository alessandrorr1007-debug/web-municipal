export const consultarRuc = async (ruc) => {
  const response = await fetch(
    `http://localhost:3000/api/ruc/${ruc}`
  );

  if (!response.ok) {
    throw new Error("Error consultando RUC");
  }

  return await response.json();
};