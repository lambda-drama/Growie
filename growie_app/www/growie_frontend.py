import frappe


def get_context(context):
	context.no_cache = 1
	# Always generate a CSRF token — even Guest sessions need one so that
	# the signup/login POST requests are accepted by Frappe's CSRF guard.
	context.csrf_token = frappe.sessions.get_csrf_token()
	return context
