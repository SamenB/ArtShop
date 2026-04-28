"""
Unit tests for the email service.
Tests SMTP interactions, template parsing, and missing template scenarios.
"""

from unittest.mock import MagicMock, patch

import pytest

from src.services.email import (
    _send_single_email,
    send_contact_emails,
    send_fulfillment_status_email,
)


@pytest.fixture
def mock_settings():
    with patch("src.services.email.settings") as mock_set:
        mock_set.SMTP_HOST = "smtp.test.com"
        mock_set.SMTP_PORT = 465
        mock_set.SMTP_USER = "test@test.com"
        mock_set.SMTP_PASSWORD = "password123"
        mock_set.ADMIN_EMAILS = ["admin@test.com"]
        yield mock_set

@pytest.fixture
def mock_smtp():
    with patch("src.services.email.smtplib.SMTP_SSL") as mock_ssl:
        mock_server = MagicMock()
        mock_ssl.return_value = mock_server
        yield mock_server

@pytest.fixture
def mock_send_single():
    with patch("src.services.email._send_single_email", return_value=True) as m:
        yield m

class TestSendSingleEmail:
    def test_missing_credentials(self, mock_settings):
        """Should safely fail when credentials are not configured."""
        mock_settings.SMTP_USER = ""
        with patch("src.services.email.logger.warning") as mock_log:
            result = _send_single_email(to="user@test.com", subject="Subj", body="Body")
            assert result is False
            mock_log.assert_called_once()

    def test_successful_ssl_send(self, mock_settings, mock_smtp):
        """Should configure SSL connection and emit the message correctly."""
        result = _send_single_email(to="user@test.com", subject="Hello", body="Test Body")
        assert result is True
        mock_smtp.login.assert_called_once_with("test@test.com", "password123")
        mock_smtp.send_message.assert_called_once()
        mock_smtp.quit.assert_called_once()

        # Check message construction
        msg = mock_smtp.send_message.call_args[0][0]
        assert msg["Subject"] == "Hello"
        assert msg["To"] == "user@test.com"

    def test_successful_tls_send(self, mock_settings):
        """Test sending via starttls instead of direct SSL."""
        mock_settings.SMTP_PORT = 587
        with patch("src.services.email.smtplib.SMTP") as mock_reg_smtp:
            mock_server = MagicMock()
            mock_reg_smtp.return_value = mock_server

            result = _send_single_email(to="user@test.com", subject="Hello", body="Test Body")
            assert result is True
            mock_server.starttls.assert_called_once()
            mock_server.login.assert_called_once()
            mock_server.send_message.assert_called_once()

    def test_network_failure(self, mock_settings, mock_smtp):
        """Should catch exceptions and return False."""
        mock_smtp.send_message.side_effect = Exception("Connection closed")
        with patch("src.services.email.logger.error") as mock_log:
            result = _send_single_email(to="user@test.com", subject="Hello", body="Test Body")
            assert result is False
            mock_log.assert_called_once()

class TestContactEmails:
    def test_both_templates_active(self, mock_settings, mock_send_single):
        """Two emails should be triggered if both templates are provided."""
        res = send_contact_emails(
            name="John Doe",
            email="john@test.com",
            message="Hello world",
            admin_subject="Admin: {name}",
            admin_body_template="Body: {message}",
            autoreply_subject="Reply for {name}",
            autoreply_body_template="Hi {name}",
        )
        assert res is True
        assert mock_send_single.call_count == 2

        # 1st call: Admin
        admin_args = mock_send_single.call_args_list[0][1]
        assert admin_args["to"] == "admin@test.com"
        assert admin_args["subject"] == "Admin: John Doe"
        assert admin_args["body"] == "Body: Hello world"

        # 2nd call: Autoreply
        auto_args = mock_send_single.call_args_list[1][1]
        assert auto_args["to"] == "john@test.com"
        assert auto_args["subject"] == "Reply for John Doe"
        assert auto_args["body"] == "Hi John Doe"

    def test_only_autoreply_active(self, mock_settings, mock_send_single):
        """Should skip admin but successfully process autoreply if admin is inactive."""
        res = send_contact_emails(
            name="John Doe",
            email="john@test.com",
            message="Hello world",
            admin_subject=None,
            admin_body_template=None,
            autoreply_subject="Reply for {name}",
            autoreply_body_template="Hi {name}",
        )
        assert res is True
        assert mock_send_single.call_count == 1
        args = mock_send_single.call_args[1]
        assert args["to"] == "john@test.com"

    def test_partial_template_skipped(self, mock_settings, mock_send_single):
        """Should skip processing if one part of a template pair is empty/none."""
        res = send_contact_emails(
            name="John Doe", email="john@test.com", message="Hi",
            admin_subject="Subj", admin_body_template=None,     # Partial
            autoreply_subject=None, autoreply_body_template="H" # Partial
        )
        assert res is True
        assert mock_send_single.call_count == 0

class TestFulfillmentEmails:
    def test_template_inactive_skipped(self, mock_send_single):
        """Should just return True and log a warning if template is missing."""
        with patch("src.services.email.logger.warning") as mock_log:
            res = send_fulfillment_status_email(
                order_id=1, first_name="Jane", customer_email="jane@test.com",
                fulfillment_status="shipped",
                subject_template=None, body_template=None
            )
            assert res is True
            assert mock_send_single.call_count == 0
            mock_log.assert_called_once()

    def test_generic_status_delivered(self, mock_send_single):
        """Checks formatting for statuses lacking tracking codes."""
        res = send_fulfillment_status_email(
            order_id=1, first_name="Jane", customer_email="jane@test.com",
            fulfillment_status="delivered",
            subject_template="Order #{order_id}",
            body_template="Hi {first_name}, {tracking_block} Enjoy!"
        )
        assert res is True
        mock_send_single.assert_called_once()
        args = mock_send_single.call_args[1]
        assert args["subject"] == "Order #1"
        assert args["body"] == "Hi Jane,  Enjoy!" # Empty tracking block

    def test_shipped_status_with_tracking(self, mock_send_single):
        """Checks injection of tracking urls."""
        res = send_fulfillment_status_email(
            order_id=2, first_name="Tom", customer_email="tom@test.com",
            fulfillment_status="shipped",
            tracking_number="ABC", carrier="FedEx", tracking_url="http://track.me",
            subject_template="Shipped #{order_id}",
            body_template="T: {tracking_block}"
        )
        assert res is True
        args = mock_send_single.call_args[1]
        assert "Carrier: FedEx" in args["body"]
        assert "Track your parcel: http://track.me" in args["body"]

    def test_shipped_status_without_carrier_url(self, mock_send_single):
        """Defaults for incomplete tracking info."""
        res = send_fulfillment_status_email(
            order_id=2, first_name="Tom", customer_email="tom@test.com",
            fulfillment_status="shipped",
            tracking_number="ABC", carrier=None, tracking_url=None,
            subject_template="Shipped", body_template="T: {tracking_block}"
        )
        assert res is True
        args = mock_send_single.call_args[1]
        assert "Carrier: Carrier" in args["body"]
        assert "Tracking number: ABC" in args["body"]
        assert "Track your parcel" not in args["body"]

    def test_exception_handling(self, mock_send_single):
        """Should safely catch formatting/processing errors."""
        # Force a key error by providing a mock template with undefined keys
        with patch("src.services.email.logger.error") as mock_log:
            res = send_fulfillment_status_email(
                order_id=1, first_name="Bob", customer_email="bob@test.com",
                fulfillment_status="shipped",
                subject_template="{undefined_key}", body_template="Valid"
            )
            assert res is False
            mock_log.assert_called_once()
