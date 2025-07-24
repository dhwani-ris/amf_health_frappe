# -*- coding: utf-8 -*-
# Copyright (c) 2018, ESS LLP and contributors
# For license information, please see license.txt


import json

import frappe
from frappe.utils import cint


# am_health.am_health.page.am_patient_history.am_patient_history.get_feed
@frappe.whitelist()
def get_feed(name, document_types=None, date_range=None, start=0, page_length=20):
    """get feed"""
    filters = get_filters(name, document_types, date_range)

    result = frappe.db.get_all(
        "Patient Medical Record",
        fields=[
            "name",
            "owner",
            "communication_date",
            "reference_doctype",
            "reference_name",
            "subject",
        ],
        filters=filters,
        order_by="communication_date DESC",
        limit=cint(page_length),
        start=cint(start),
    )
    for i, data in enumerate(
        result[:]
    ):  # Iterate over a copy since you'll modify the list
        patient_medicine_prescription_form = frappe.db.get_value(
            "Medicine Prescription Form",
            {
                "docstatus": ["!=", 2],
                "patient_encounter": data.reference_name,
            },
        )

        if patient_medicine_prescription_form:
            prescription_details = frappe.db.get_all(
                "Prescription Details",
                filters={"parent": patient_medicine_prescription_form},
                fields=[
                    "medicine",
                    "type",
                    "dosage_timing",
                    "administration_time",
                ],
            )
            if prescription_details:
                html = generate_prescription_html(prescription_details)
                new_data = {}
                new_data["subject"] = html
                new_data["reference_doctype"] = "Medicine Prescription Form"
                new_data["reference_name"] = patient_medicine_prescription_form
                new_data["communication_date"] = data.communication_date
                result.insert(i + 1, new_data)  # Insert after current item
    return result


def generate_prescription_html(prescription_details):
    if not prescription_details:
        return "<p>No prescription details available.</p>"

    html = """
    <table border="1" cellspacing="0" cellpadding="6" style="width: 100%; border-collapse: collapse;">
        <thead>
            <tr>
                <th>#</th>
                <th>Medicine</th>
                <th>Type</th>
                <th>Dosage Timing</th>
                <th>Administration Time</th>
            </tr>
        </thead>
        <tbody>
    """

    for i, item in enumerate(prescription_details, 1):
        html += f"""
            <tr>
                <td>{i}</td>
                <td>{item.get('medicine', '')}</td>
                <td>{item.get('type', '')}</td>
                <td>{item.get('dosage_timing', '')}</td>
                <td>{item.get('administration_time', '')}</td>
            </tr>
        """

    html += """
        </tbody>
    </table>
    """
    return html


def get_filters(name, document_types=None, date_range=None):
    filters = {"patient": name}
    if document_types:
        document_types = json.loads(document_types)
        if len(document_types):
            filters["reference_doctype"] = ["IN", document_types]

    if date_range:
        try:
            date_range = json.loads(date_range)
            if date_range:
                filters["communication_date"] = [
                    "between",
                    [date_range[0], date_range[1]],
                ]
        except json.decoder.JSONDecodeError:
            pass

    return filters


@frappe.whitelist()
def get_feed_for_dt(doctype, docname):
    """get feed"""
    result = frappe.db.get_all(
        "Patient Medical Record",
        fields=[
            "name",
            "owner",
            "communication_date",
            "reference_doctype",
            "reference_name",
            "subject",
        ],
        filters={"reference_doctype": doctype, "reference_name": docname},
        order_by="communication_date DESC",
    )

    return result


@frappe.whitelist()
def get_patient_history_doctypes():
    document_types = []
    settings = frappe.get_single("Patient History Settings")

    for entry in settings.standard_doctypes:
        document_types.append(entry.document_type)

    for entry in settings.custom_doctypes:
        document_types.append(entry.document_type)

    return document_types
