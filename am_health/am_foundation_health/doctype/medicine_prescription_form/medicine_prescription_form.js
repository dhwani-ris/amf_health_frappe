frappe.ui.form.on("Medicine Prescription Form", {
    refresh(frm) {
        setReadOnlyForAllDates(frm, frm.doc.district);
    },

});

frappe.ui.form.on("Prescription Details", {
    prescription_details_add(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        if (frm.doc.district) {
            frappe.model.set_value(cdt, cdn, 'district', frm.doc.district);
            // frappe.meta.get_docfield('Prescription Details', 'district', frm.doc.name).read_only = 1;
        }
    }
});
        // Set the district field as read-only for all prescription details

function setReadOnlyForAllDates(frm, district) {
    frm.doc.prescription_details.forEach((log) => {
        frappe.model.set_value(log.doctype, log.name, 'district', district);
        // frappe.meta.get_docfield('Prescription Detail', 'district', frm.doc.name).read_only = 1;
    });
    // frm.refresh_field('prescription_details'); // Refresh the field to apply the read-only property
}
