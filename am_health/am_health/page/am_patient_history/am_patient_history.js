frappe.provide('frappe.patient_history');
frappe.pages['am_patient_history'].on_page_load = function(wrapper) {
	
	frappe.ui.make_app_page({
		parent: wrapper,
		title: __('Patient History')
	});

	let patient_history = new PatientHistory(wrapper);
	$(wrapper).bind('show', ()=> {
		patient_history.show();
	});
};

class PatientHistory {
	constructor(wrapper) {
		this.wrapper = $(wrapper);
		this.page = wrapper.page;
		this.sidebar = this.wrapper.find('.layout-side-section');
		this.main_section = this.wrapper.find('.layout-main-section');
		this.start = 0;
	}

	show() {
		frappe.breadcrumbs.add('Healthcare');
		this.sidebar.empty();

		let me = this;
		let patient = frappe.ui.form.make_control({
			parent: me.sidebar,
			df: {
				fieldtype: 'Link',
				options: 'Patient',
				fieldname: 'patient',
				placeholder: __('Select Patient'),
				only_select: true,
				change: () => {
					me.patient_id = '';
					if (me.patient_id != patient.get_value() && patient.get_value()) {
						me.start = 0;
						me.patient_id = patient.get_value();
						me.make_patient_profile();
					}
				}
			}
		});
		patient.df.change();
		patient.refresh();

		if (frappe.route_options && !this.patient_id) {
			patient.set_value(frappe.route_options.patient);
			this.patient_id = frappe.route_options.patient;
		}

		this.sidebar.find('[data-fieldname="patient"]').append('<div class="patient-info"></div>');
	}

	make_patient_profile() {
		this.page.set_title(__('Patient History'));
		this.main_section.empty().append(frappe.render_template('am_patient_history'));
		this.setup_filters();
		this.setup_documents();
		this.show_patient_info();
		this.setup_buttons();
		this.show_patient_vital_charts('bp', 'mmHg', 'Blood Pressure');
	}

	setup_filters() {
		$('.doctype-filter').empty();
		let me = this;

		frappe.xcall(
			'am_health.am_health.page.am_patient_history.am_patient_history.get_patient_history_doctypes'
		).then(document_types => {
			let doctype_filter = frappe.ui.form.make_control({
				parent: $('.doctype-filter'),
				df: {
					fieldtype: 'MultiSelectList',
					fieldname: 'document_type',
					placeholder: __('Select Document Type'),
					change: () => {
						me.start = 0;
						me.page.main.find('.patient_documents_list').html('');
						this.setup_documents(doctype_filter.get_value(), date_range_field.get_value());
					},
					get_data: () => {
						return document_types.map(document_type => {
							return {
								description: document_type,
								value: document_type
							};
						});
					},
				}
			});
			doctype_filter.refresh();

			$('.date-filter').empty();
			let date_range_field = frappe.ui.form.make_control({
				df: {
					fieldtype: 'DateRange',
					fieldname: 'date_range',
					placeholder: __('Date Range'),
					input_class: 'input-xs',
					change: () => {
						let selected_date_range = date_range_field.get_value();
						if (selected_date_range && selected_date_range.length === 2) {
							me.start = 0;
							me.page.main.find('.patient_documents_list').html('');
							this.setup_documents(doctype_filter.get_value(), date_range_field.get_value());
						}
					}
				},
				parent: $('.date-filter')
			});
			date_range_field.refresh();
		});
	}

	setup_documents(document_types="", selected_date_range="") {
		let filters = {
			name: this.patient_id,
			start: this.start,
			page_length: 20
		};
		if (document_types)
			filters['document_types'] = document_types;
		if (selected_date_range)
			filters['date_range'] = selected_date_range;

		let me = this;
		frappe.call({
			'method': 'am_health.am_health.page.am_patient_history.am_patient_history.get_feed',
			args: filters,
			callback: function(r) {
				let data = r.message;
				if (data.length) {
					me.add_to_records(data);
				} else {
					me.page.main.find('.patient_documents_list').append(`
						<div class='text-muted' align='center'>
							<br><br>${__('No more records..')}<br><br>
						</div>`);
					me.page.main.find('.btn-get-records').hide();
				}
			}
		});
	}

		// Add this method to group and merge related documents
	group_documents_by_date_and_encounter(data) {
		let grouped = {};
		
		for (let i = 0; i < data.length; i++) {
			let item = data[i];
			if (!item.reference_doctype) continue;
			
			// Create a key based on date and encounter (if available)
			let dateKey = frappe.datetime.str_to_obj(item.communication_date).toDateString();
			let encounterKey = item.encounter || 'no_encounter';
			let groupKey = `${dateKey}_${encounterKey}`;
			
			if (!grouped[groupKey]) {
				grouped[groupKey] = {
					date: item.communication_date,
					encounter: item.encounter,
					documents: [],
					practitioner: item.practitioner,
					owner: item.owner
				};
			}
			
			grouped[groupKey].documents.push(item);
		}
		
		return grouped;
	}

	// Modified add_to_records method
	add_to_records(data) {
		let details = "";
		let grouped_data = this.group_documents_by_date_and_encounter(data);
		
		for (let groupKey in grouped_data) {
			let group = grouped_data[groupKey];
			let firstDoc = group.documents[0];
			
			// Add date separator using the first document
			firstDoc = this.add_date_separator(firstDoc);
			
			// Handle image source
			if (frappe.user_info(group.owner).image) {
				group.imgsrc = frappe.utils.get_file_link(frappe.user_info(group.owner).image);
			} else {
				group.imgsrc = false;
			}
			
			// Create merged card
			details += `
				<div data-toggle='pill' class='patient_doc_menu merged-documents'
					data-group-key='${groupKey}'>
					<div class='col-sm-12 d-flex border-bottom py-3'>`;
			
			if (group.imgsrc) {
				details += `<span class='mr-3 avatar avatar-small' style='width:32px; height:32px;'>
						<img class='avatar-frame' src='${group.imgsrc}' width='32' height='32'></img>
					</span>`;
			} else {
				details += `<span class='mr-3 avatar avatar-small' style='width:32px; height:32px;'>
					<div align='center' class='avatar-frame' style='background-color: #fafbfc;'>
						${group.practitioner ? group.practitioner.charAt(0) : 'U'}
					</div>
				</span>`;
			}
			
			// Create header with multiple document types
			let documentTypes = group.documents.map(doc => doc.reference_doctype).join(', ');
			let time_line_heading = group.practitioner ? `${group.practitioner} ` : ``;
			time_line_heading += `${documentTypes}`;
			
			if (group.encounter) {
				time_line_heading += ` - <a onclick="frappe.set_route('Form', 'Patient Encounter', '${group.encounter}');">${group.encounter}</a>`;
			}
			
			details += `<div class='d-flex flex-column width-full'>
					<div class='d-flex justify-between items-center'>
						<strong class='text-muted mr-3' style='min-width: 100px;'><b><u>${firstDoc.date_sep}</u></b></strong>
						<span>${time_line_heading}</span>
					</div>
					
					<div class='frappe-card p-5 mt-3'>`;
			
			// Add each document in the group
			for (let j = 0; j < group.documents.length; j++) {
				let doc = group.documents[j];
				let label = doc.subject ? `<br/>${doc.subject}` : '';
				
				details += `
					<div class='document-section' style='${j > 0 ? 'border-top: 1px solid #e0e0e0; margin-top: 15px; padding-top: 15px;' : ''}'>
						<div class='document-header' style='margin-bottom: 10px;'>
							<strong>${doc.reference_doctype}</strong>
							${doc.reference_doctype !== 'Medicine Prescription Form' ? 
								`<a onclick="frappe.set_route('Form', '${doc.reference_doctype}', '${doc.reference_name}');" 
								style='margin-left: 10px; color: #007bff;'>
									${doc.reference_name}
								</a>` : 
								`<span style='margin-left: 10px; color: #666;'></span>`
							}
						</div>

						
						<span class='${doc.reference_name} document-id' style='display: none;'>${label}
							<br>
							<div align='center'>
								<a class='btn octicon octicon-chevron-down btn-default btn-xs btn-more'
									data-doctype='${doc.reference_doctype}' 
									data-docname='${doc.reference_name}'>
								</a>
							</div>
						</span>
						
						<span class='document-html' data-fetched='0' data-doctype='${doc.reference_doctype}' data-docname='${doc.reference_name}'>
							<div class='loading-indicator' style='text-align: center; padding: 20px;'>
								Loading ${doc.reference_doctype} details...
							</div>
						</span>
					</div>`;
			}
			
			details += `</div>
				</div>
			</div>
			</div>`;
		}
		
		this.page.main.find('.patient_documents_list').append(details);
		
		// Auto-load document details for all documents in each group
		let me = this;
		for (let groupKey in grouped_data) {
			let group = grouped_data[groupKey];
			for (let j = 0; j < group.documents.length; j++) {
				let doc = group.documents[j];
				this.load_document_details(doc.reference_doctype, doc.reference_name);
			}
		}
		
		this.start += data.length;
		
		if (data.length === 20) {
			this.page.main.find(".btn-get-records").show();
		} else {
			this.page.main.find(".btn-get-records").hide();
			this.page.main.find(".patient_documents_list").append(`
				<div class='text-muted' align='center'>
					<br><br>${__('No more records..')}<br><br>
				</div>`);
		}
	}

	// Modified load_document_details method to handle the new structure
	load_document_details(doctype, docname) {
		let me = this;
		let exclude = ['patient', 'patient_name', 'patient_sex', 'encounter_date', 'naming_series'];
		
		frappe.call({
			method: 'healthcare.healthcare.utils.render_doc_as_html',
			args: {
				doctype: doctype,
				docname: docname,
				exclude_fields: exclude
			},
			callback: function(r) {
				if (r.message) {
					// Find the specific document section
					me.page.main.find(`.document-html[data-docname="${docname}"]`).html(
						`${r.message.html}
						<br>
							<div align='center'>
								<a class='btn octicon octicon-chevron-up btn-default btn-xs btn-less'
									data-doctype='${doctype}'
									data-docname='${docname}'>
								</a>
							</div>
						`);
					me.page.main.find(`.document-html[data-docname="${docname}"]`).attr('data-fetched', '1');
				}
			}
		});
	}

	add_date_separator(data) {
		let date = frappe.datetime.str_to_obj(data.communication_date);
		let pdate = '';
		let diff = frappe.datetime.get_day_diff(frappe.datetime.get_today(),
			frappe.datetime.obj_to_str(date));

		if (diff < 1) {
			pdate = __('Today');
		} else if (diff < 2) {
			pdate = __('Yesterday');
		} else {
			pdate = __('On {0}', [frappe.datetime.global_date_format(date)]);
		}
		data.date_sep = pdate;
		return data;
	}

	show_patient_info() {
		this.get_patient_info().then(() => {
			$('.patient-info').empty().append(frappe.render_template('am_patient_history_sidebar', {
				patient_image: this.patient.image,
				patient_name: this.patient.patient_name,
				patient_gender: this.patient.sex,
				patient_mobile: this.patient.mobile
			}));
			this.show_patient_details();
		});
	}

	show_patient_details() {
		let me = this;
		frappe.call({
			'method': 'healthcare.healthcare.doctype.patient.patient.get_patient_detail',
			args: {
				patient: me.patient_id
			},
			callback: function(r) {
				let data = r.message;
				let details = ``;

				if (data.occupation) details += `<br><br><b> ${__('Occupation')} : </b> ${data.occupation}`;
				if (data.blood_group) details += `<br><b> ${__('Blood Group')} : </b> ${data.blood_group}`;
				if (data.allergies) details +=  `<br><br><b> ${__('Allerigies')} : </b> ${data.allergies.replace(/\n/g, ", ")}`;
				if (data.medication) details +=  `<br><b> ${__('Medication')} : </b> ${data.medication.replace(/\n/g, ", ")}`;
				if (data.alcohol_current_use) details +=  `<br><br><b> ${__('Alcohol use')} : </b> ${data.alcohol_current_use}`;
				if (data.alcohol_past_use) details +=  `<br><b> ${__('Alcohol past use')} : </b> ${data.alcohol_past_use}`;
				if (data.tobacco_current_use) details +=  `<br><b> ${__('Tobacco use')} : </b> ${data.tobacco_current_use}`;
				if (data.tobacco_past_use) details +=  `<br><b> ${__('Tobacco past use')} : </b> ${data.tobacco_past_use}`;
				if (data.medical_history) details +=  `<br><br><b> ${__('Medical history')} : </b> ${data.medical_history.replace(/\n/g, ", ")}`;
				if (data.surgical_history) details +=  `<br><b> ${__('Surgical history')} : </b> ${data.surgical_history.replace(/\n/g, ", ")}`;
				if (data.surrounding_factors) details +=  `<br><br><b> ${__('Occupational hazards')} : </b> ${data.surrounding_factors.replace(/\n/g, ", ")}`;
				if (data.other_risk_factors) details += `<br><b> ${__('Other risk factors')} : </b> ${data.other_risk_factors.replace(/\n/g, ", ")}`;
				if (data.patient_details) details += `<br><br><b> ${__('More info')} : </b> ${data.patient_details.replace(/\n/g, ", ")}`;

				if (details) {
					details = `<div style='font-size:13px;' align='left'>` + details + `</div>`;
				}

				me.sidebar.find('.patient-details').html(details);
			}
		});
	}

	get_patient_info() {
		return frappe.xcall('frappe.client.get', {
			doctype: 'Patient',
			name: this.patient_id,
		}).then((patient) => {
			if (patient) {
				this.patient = patient;
			}
		});
	}

		
	// Modified setup_buttons method to handle the new structure
	setup_buttons() {
		let me = this;
		this.page.main.on("click", ".btn-show-chart", function() {
			let btn_id = $(this).attr("data-show-chart-id"), scale_unit = $(this).attr("data-pts");
			let title = $(this).attr("data-title");
			me.show_patient_vital_charts(btn_id, scale_unit, title);
		});

		this.page.main.on('click', '.btn-more', function() {
			let	doctype = $(this).attr('data-doctype'), docname = $(this).attr('data-docname');
			let documentHtml = me.page.main.find(`.document-html[data-docname="${docname}"]`);
			
			if (documentHtml.attr('data-fetched') == '1') {
				me.page.main.find('.' + docname).hide();
				documentHtml.show();
			} else {
				if (doctype && docname) {
					let exclude = ['patient', 'patient_name', 'patient_sex', 'encounter_date', 'naming_series'];
					frappe.call({
						method: 'healthcare.healthcare.utils.render_doc_as_html',
						args: {
							doctype: doctype,
							docname: docname,
							exclude_fields: exclude
						},
						freeze: true,
						callback: function(r) {
							if (r.message) {
								me.page.main.find('.' + docname).hide();

								documentHtml.html(
									`${r.message.html}
									<br>
										<div align='center'>
											<a class='btn octicon octicon-chevron-up btn-default btn-xs btn-less'
												data-doctype='${doctype}'
												data-docname='${docname}'>
											</a>
										</div>
									`);

								documentHtml.attr('hidden', false);
								documentHtml.attr('data-fetched', '1');
							}
						}
					});
				}
			}
		});

		this.page.main.on('click', '.btn-less', function() {
			let docname = $(this).attr('data-docname');
			me.page.main.find('.' + docname).parent().find('.document-id').show();
			me.page.main.find(`.document-html[data-docname="${docname}"]`).hide();
		});

		me.page.main.on('click', '.btn-get-records', function() {
			me.setup_documents();
		});
	}

	show_patient_vital_charts(btn_id, scale_unit, title) {
		let me = this;

		frappe.call({
			method: 'healthcare.healthcare.utils.get_patient_vitals',
			args: {
				patient: me.patient_id
			},
			callback: function(r) {
				if (r.message) {
					let show_chart_btns_html = `
						<div style='padding-top:10px;'>
							<a class='btn btn-default btn-xs btn-show-chart' data-show-chart-id='bp' data-pts='mmHg' data-title='Blood Pressure'>
								${__('Blood Pressure')}
							</a>
							<a class='btn btn-default btn-xs btn-show-chart' data-show-chart-id='pulse_rate' data-pts='per Minutes' data-title='Respiratory/Pulse Rate'>
								${__('Respiratory/Pulse Rate')}
							</a>
							<a class='btn btn-default btn-xs btn-show-chart' data-show-chart-id='temperature' data-pts='°C or °F' data-title='Temperature'>
								${__('Temperature')}
							</a>
							<a class='btn btn-default btn-xs btn-show-chart' data-show-chart-id='bmi' data-pts='' data-title='BMI'>
								${__('BMI')}
							</a>
						</div>`;

					me.page.main.find('.show_chart_btns').html(show_chart_btns_html);
					let data = r.message;
					let labels = [], datasets = [];
					let bp_systolic = [], bp_diastolic = [], temperature = [];
					let pulse = [], respiratory_rate = [], bmi = [], height = [], weight = [];

					for (let i=0; i<data.length; i++) {
						labels.push(data[i].signs_date+' | '+data[i].signs_time);

						if (btn_id === 'bp') {
							bp_systolic.push(data[i].bp_systolic);
							bp_diastolic.push(data[i].bp_diastolic);
						}
						if (btn_id === 'temperature') {
							temperature.push(data[i].temperature);
						}
						if (btn_id === 'pulse_rate') {
							pulse.push(data[i].pulse);
							respiratory_rate.push(data[i].respiratory_rate);
						}
						if (btn_id === 'bmi') {
							bmi.push(data[i].bmi);
							height.push(data[i].height);
							weight.push(data[i].weight);
						}
					}
					if (btn_id === 'temperature') {
						datasets.push({name: 'Temperature', values: temperature, chartType: 'line'});
					}
					if (btn_id === 'bmi') {
						datasets.push({name: 'BMI', values: bmi, chartType: 'line'});
						datasets.push({name: 'Height', values: height, chartType: 'line'});
						datasets.push({name: 'Weight', values: weight, chartType: 'line'});
					}
					if (btn_id === 'bp') {
						datasets.push({name: 'BP Systolic', values: bp_systolic, chartType: 'line'});
						datasets.push({name: 'BP Diastolic', values: bp_diastolic, chartType: 'line'});
					}
					if (btn_id === 'pulse_rate') {
						datasets.push({name: 'Heart Rate / Pulse', values: pulse, chartType: 'line'});
						datasets.push({name: 'Respiratory Rate', values: respiratory_rate, chartType: 'line'});
					}

					new frappe.Chart('.patient_vital_charts', {
						data: {
							labels: labels,
							datasets: datasets
						},

						title: title,
						type: 'axis-mixed',
						height: 200,
						colors: ['purple', '#ffa3ef', 'light-blue'],

						tooltipOptions: {
							formatTooltipX: d => (d + '').toUpperCase(),
							formatTooltipY: d => d + ' ' + scale_unit,
						}
					});
					me.page.main.find('.header-separator').show();
				} else {
					me.page.main.find('.patient_vital_charts').html('');
					me.page.main.find('.show_chart_btns').html('');
					me.page.main.find('.header-separator').hide();
				}
			}
		});
	}
}
