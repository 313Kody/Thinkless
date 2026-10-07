(() => {
  const theme = {
    background: "#111827",
    color: "#f9fafb",
    confirmButtonColor: "#4f46e5",
    cancelButtonColor: "#374151",
    customClass: { popup: "rounded-2xl border border-gray-700" },
  };

  window.showAlert = (message, icon = "info") =>
    Swal.fire({ ...theme, icon, text: message });

  window.showConfirm = (message, options = {}) =>
    Swal.fire({
      ...theme,
      icon: options.icon || "question",
      text: message,
      showCancelButton: true,
      confirmButtonText: options.confirmText || "Confirmer",
      cancelButtonText: options.cancelText || "Annuler",
      reverseButtons: true,
    }).then((result) => result.isConfirmed);

  window.showPrompt = async (message, options = {}) => {
    const result = await Swal.fire({
      ...theme,
      input: options.input || "text",
      inputLabel: message,
      inputPlaceholder: options.placeholder || "",
      inputValue: options.value || "",
      showCancelButton: true,
      confirmButtonText: options.confirmText || "Valider",
      cancelButtonText: "Annuler",
      reverseButtons: true,
      inputValidator:
        options.required === false
          ? undefined
          : (value) =>
              !value || !value.trim() ? "Ce champ est requis" : undefined,
    });
    return result.isConfirmed ? result.value : null;
  };
})();
