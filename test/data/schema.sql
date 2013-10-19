--
-- PostgreSQL database dump
--

SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = off;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET escape_string_warning = off;

SET search_path = public, pg_catalog;

SET default_tablespace = '';

SET default_with_oids = false;

--
-- Name: objects; Type: TABLE; Schema: public; Owner: postgres; Tablespace:
--

CREATE TABLE objects (
    id integer NOT NULL,
    object_id character varying(256),
    name1 character varying(256),
    name2 character varying(256),
    source character varying(256),
    created date DEFAULT now(),
    wkb_geometry geometry,
    CONSTRAINT enforce_dims_wkb_geometry CHECK ((st_ndims(wkb_geometry) = 2)),
    CONSTRAINT enforce_geotype_wkb_geometry CHECK (((geometrytype(wkb_geometry) = 'MULTIPOLYGON'::text) OR (wkb_geometry IS NULL))),
    CONSTRAINT enforce_srid_wkb_geometry CHECK ((st_srid(wkb_geometry) = 4326))
);


ALTER TABLE public.objects OWNER TO postgres;

--
-- Name: objects_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE objects_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;


ALTER TABLE public.objects_id_seq OWNER TO postgres;

--
-- Name: objects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE objects_id_seq OWNED BY objects.id;


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY objects ALTER COLUMN id SET DEFAULT nextval('objects_id_seq'::regclass);


--
-- Name: objects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres; Tablespace:
--

ALTER TABLE ONLY objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: idx_gist_wkb_geometry; Type: INDEX; Schema: public; Owner: postgres; Tablespace:
--

CREATE INDEX idx_gist_wkb_geometry ON objects USING gist (wkb_geometry);


--
-- Name: source_idx; Type: INDEX; Schema: public; Owner: postgres; Tablespace:
--

CREATE INDEX source_idx ON objects USING btree (source);


--
-- PostgreSQL database dump complete
--
